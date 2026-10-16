"""真实浏览器冒烟测试：验证页面渲染、节点选中、编排执行与流式输出。"""
import os
import sys

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

from playwright.sync_api import sync_playwright  # noqa: E402

BASE = "http://127.0.0.1:3000"
DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")
SHOT = os.path.abspath(os.path.join(DOCS, "screenshot.png"))

errors = []


def check(label, cond, extra=""):
    if not cond:
        errors.append(label)
    print(f"[{'PASS' if cond else 'FAIL'}] {label}{(' -> ' + extra) if extra else ''}")


def run_turn(page, text):
    """发送一句话，等整条流程跑完，返回助手完整回复。"""
    page.locator(".chat-input textarea").fill(text)
    page.locator(".send-btn").click()
    # 执行轨迹出现 = 流程已走完
    page.wait_for_selector(".steps-toggle", state="attached", timeout=40000)
    page.wait_for_selector(".stop-btn", state="detached", timeout=40000)
    return page.locator(".chat-msg.is-assistant .chat-bubble").last.inner_text()


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-proxy-server"])
    page = browser.new_page(viewport={"width": 1560, "height": 940})

    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="networkidle")

    check("画布渲染 7 个节点", page.locator(".node-card").count() == 7,
          f"实际 {page.locator('.node-card').count()}")
    check("画布渲染 6 条连线", page.locator(".edge-line").count() == 6,
          f"实际 {page.locator('.edge-line').count()}")
    check("默认进入演示模式", "演示模式" in page.locator(".badge").inner_text(),
          page.locator(".badge").inner_text())

    page.locator(".node-card", has_text="生成客服答复").first.click()
    check("点击节点后配置面板出现提示词", "提示词" in page.locator(".config").inner_text())

    r1 = run_turn(page, "退货之后退款要多久到账？")
    check("流程返回结果", len(r1) > 20, f"{len(r1)} 字符")
    check("命中退款剧本", "退款时效" in r1 or "退款" in r1, r1[:40].replace("\n", " "))
    check("出现执行轨迹入口", page.locator(".steps-toggle").count() > 0)
    page.locator(".steps-toggle").last.click()
    page.wait_for_selector(".steps-list li", state="attached", timeout=10000)
    check("执行轨迹含多步", page.locator(".steps-list li").count() >= 4,
          f"{page.locator('.steps-list li').count()} 步")

    r2 = run_turn(page, "我要投诉，帮我转人工")
    check("投诉走 true 分支并登记工单", "工单" in r2, r2[:50].replace("\n", " "))

    r3 = run_turn(page, "帮我算一下 (128+72)*0.85")
    check("工具节点产出结果", len(r3) > 10, r3[:50].replace("\n", " "))

    check("无控制台错误", len(console_errors) == 0, "; ".join(console_errors[:3]))

    page.screenshot(path=SHOT)
    browser.close()

print("\n截图:", SHOT)
if errors:
    print("失败项:", errors)
    sys.exit(1)
print("全部通过")
