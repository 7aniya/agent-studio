# -*- coding: utf-8 -*-
"""为掘金文章生成插图 2、3。

插图 2（trace.png）：投诉场景 + 展开执行轨迹
插图 3（branch-compare.png）：同一流程「是 / 否」两个分支的答复对比
"""
import os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

URL = "https://agent-studio-canvas.app.workbuddy.host/"
DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")
DOCS = os.path.normpath(DOCS)

def font_candidates():
    return [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
    ]

def load_font(size):
    for p in font_candidates():
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-proxy-server"])
    pg = b.new_page(viewport={"width": 1560, "height": 940}, device_scale_factor=2)
    pg.goto(URL, wait_until="networkidle", timeout=60000)

    # 场景 A：投诉 → 走「是」分支
    pg.locator(".chat-input textarea").fill("我要投诉，转人工")
    pg.locator(".send-btn").click()
    pg.wait_for_selector(".stop-btn", state="detached", timeout=60000)
    pg.wait_for_timeout(600)

    # 插图 2：展开执行轨迹后截整个对话面板
    pg.locator(".steps-toggle").click()
    pg.wait_for_timeout(500)
    pg.locator("section.chat").screenshot(path=os.path.join(DOCS, "trace.png"))
    pg.locator(".steps-toggle").click()  # 收起
    pg.wait_for_timeout(300)

    # 场景 B：退款 → 走「否」分支
    pg.locator(".chat-input textarea").fill("退货之后退款要多久到账")
    pg.locator(".send-btn").click()
    pg.wait_for_selector(".stop-btn", state="detached", timeout=60000)
    pg.wait_for_timeout(600)

    # 插图 3 素材：两条 assistant 消息各截一张
    pg.locator(".chat-msg.is-assistant").first.screenshot(path="/tmp/branch-a.png")
    pg.locator(".chat-msg.is-assistant").last.screenshot(path="/tmp/branch-b.png")

    b.close()

# ---- 拼接分支对比图 ----
a = Image.open("/tmp/branch-a.png").convert("RGB")
bimg = Image.open("/tmp/branch-b.png").convert("RGB")

GAP, PAD = 40, 32
TITLE_H, LABEL_H = 64, 52
H = PAD + TITLE_H + LABEL_H + max(a.height, bimg.height) + PAD
W = PAD + a.width + GAP + bimg.width + PAD

canvas = Image.new("RGB", (W, H), (241, 239, 232))
d = ImageDraw.Draw(canvas)
f_title = load_font(30)
f_label = load_font(22)

# 总标题
t = "同一张画布，两个分支"
tw = d.textlength(t, font=f_title)
d.text(((W - tw) / 2, PAD + 8), t, font=f_title, fill=(12, 68, 124))

# 两个小标题
y = PAD + TITLE_H
d.text((PAD, y), "「我要投诉，转人工」→ 是分支 · 登记工单", font=f_label, fill=(12, 68, 124))
d.text((PAD + a.width + GAP, y), "「退货退款到账」→ 否分支 · 直接答复", font=f_label, fill=(12, 68, 124))

# 贴图
y += LABEL_H
canvas.paste(a, (PAD, y))
canvas.paste(bimg, (PAD + a.width + GAP, y))

out = os.path.join(DOCS, "branch-compare.png")
canvas.save(out, optimize=True)

for name in ("trace.png", "branch-compare.png"):
    path = os.path.join(DOCS, name)
    print(f"{name}: {os.path.getsize(path) // 1024} KB, {Image.open(path).size}")
