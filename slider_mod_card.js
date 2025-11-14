// v 1.1.0
class SliderModCard extends HTMLElement {
 static getConfigElement() { return null; }
 static getStubConfig() {
   return {
     type: "custom:slider-mod-card",
     icon: "mdi:lightbulb-on",
     name: "[[[]]]",
     show_name: true,
     value_range_min: 0,
     value_range_max: 100,
     value_range_step: 1,
     bar_left_color: "yellow",
     bar_right_color: "gray",
     styles: {},
   };
 }

 setConfig(config) {
   if (!config) throw new Error("No config");
   this._config = {
     show_name: true,
     value_range_min: 0,
     value_range_max: 100,
     value_range_step: 1,
     bar_left_color: "yellow",
     bar_right_color: "gray",
     styles: {},
     ...config,
   };
   this._build();
 }

 set hass(hass) {
   this._hass = hass;
   if (!this._root) return;

   // 1s 抑制：拖动结束后忽略外部同步，防回溯
   const now = Date.now();
   const suppressExternal = this._lastUserSetTime && (now - this._lastUserSetTime < 1000);

   const syncVal = suppressExternal ? null : this._evalMaybeTemplate(this._config.sync_value);
   const numericSync = this._toNumber(syncVal, this._currentValue ?? null);

   // name
   const renderedName = this._evalMaybeTemplate(this._config.name);
   this._nameEl.textContent = this._config.show_name ? (renderedName ?? "") : "";
   this._nameEl.style.display = this._config.show_name ? "" : "none";
   this._applyInlineStyles(this._nameEl, this._config.styles?.name);

   // icon
   this._renderThumbIcon();
   this._applyIconStyles(this._config.styles?.icon);

   // 外部同步（非拖动 & 未抑制）
   if (!this._isDragging && numericSync != null && !Number.isNaN(numericSync)) {
     this._setValueAnimated(this._clampStep(numericSync));
   }

   // tips 样式（同步到 portal 变量）
   this._applyTipsStyles(this._config.styles?.tips);

   // 文本
   this._updateBubbleText(`${this._currentValue ?? this._min}`);

   // 渲染
   this._paintBars(true);
   this._syncBarCornerRadius();
 }

 connectedCallback() {
   if (!this._root) this._build();
 }
 disconnectedCallback() {
   // 清理全局 portal 与监听
   this._teardownBubblePortal();
   window.removeEventListener("pointermove", this._pointerMove);
   window.removeEventListener("pointerup", this._pointerUp);
   window.removeEventListener("pointercancel", this._pointerUp);
   window.removeEventListener("scroll", this._repositionOnScroll, true);
   window.removeEventListener("resize", this._repositionOnScroll, true);
 }
 getCardSize() { return 2; }

 // ---------- 内部 ----------
 _build() {
   this._min = Number(this._config.value_range_min ?? 0);
   this._max = Number(this._config.value_range_max ?? 100);
   this._step = Number(this._config.value_range_step ?? 1);
   this._currentValue = this._clampStep(
     this._toNumber(this._evalMaybeTemplate(this._config.sync_value), this._min) ?? this._min
   );

   if (!this._root) {
     this._root = document.createElement("ha-card");
     this.attachShadow({ mode: "open" }).appendChild(this._root);
   } else {
     this._root.innerHTML = "";
   }

   const style = document.createElement("style");
   style.textContent = `
     :host { display:block; }
     .wrap { position: relative; padding: 12px; }
     .name { margin-bottom: 8px; line-height: 1.2; }

     .track {
       position: relative;
       height: 12px;
       border-radius: 999px;
       background: transparent;
       overflow: visible;
       user-select: none;
     }
     .bar {
       position: absolute;
       top: 0; bottom: 0;
       pointer-events: none;
       transition: width 260ms cubic-bezier(0,0,0.2,1), left 260ms cubic-bezier(0,0,0.2,1);
     }
     .bar.anim-off { transition: none; }
     .bar-left { left: 0; }
     .bar-right { right: 0; }

     /* thumb：尺寸/颜色由 styles.icon 控制 */
     .thumb {
       position: absolute;
       top: 50%;
       transform: translate(-50%, -50%);
       display: inline-flex;
       align-items: center;
       justify-content: center;
       border-radius: 999px;
       cursor: pointer;
       touch-action: none;
       will-change: left;
       transition: left 260ms cubic-bezier(0,0,0.2,1);
       width: var(--thumb-w, 40px);
       height: var(--thumb-h, 40px);
       color: inherit;
     }
     .thumb.anim-off { transition: none; }
     .thumb ha-icon, .thumb img {
       display:block;
       width: 100%;
       height: 100%;
       --mdc-icon-size: 100%;
     }
     .thumb ha-icon { color: inherit; }

     /* —— 提示气泡 —— 
        注意：视觉样式依然定义，但实际显示走全局 portal（body 下的 fixed 元素）
        这里的 .bubble 仅作为变量源备份，不再参与显示 */
     .bubble {
       position: absolute;
       left: 0;
       bottom: calc(100% + var(--bubble-gap, 10px));
       padding: 6px 10px;
       border-radius: 14px;
       background: var(--slider-mod-bubble-bg, rgba(0,0,0,0.75));
       color: var(--slider-mod-bubble-fg, #fff);
       font-size: 12px;
       line-height: 1;
       white-space: nowrap;
       pointer-events: none;
       opacity: 0;
       transform: translate(-50%, 0) scale(0.9);
     }
   `;
   this._root.appendChild(style);

   const wrap = document.createElement("div");
   wrap.className = "wrap";
   this._root.appendChild(wrap);

   this._nameEl = document.createElement("div");
   this._nameEl.className = "name";
   wrap.appendChild(this._nameEl);

   this._trackEl = document.createElement("div");
   this._trackEl.className = "track";
   wrap.appendChild(this._trackEl);

   this._leftBar = document.createElement("div");
   this._leftBar.className = "bar bar-left";
   this._rightBar = document.createElement("div");
   this._rightBar.className = "bar bar-right";
   this._trackEl.appendChild(this._leftBar);
   this._trackEl.appendChild(this._rightBar);

   this._thumbEl = document.createElement("div");
   this._thumbEl.className = "thumb";
   this._trackEl.appendChild(this._thumbEl);

   // 仅作为样式变量来源
   this._bubbleEl = document.createElement("div");
   this._bubbleEl.className = "bubble";
   this._trackEl.appendChild(this._bubbleEl);

   // 应用样式
   this._applyInlineStyles(this._root, this._config.styles?.card);
   this._applyInlineStyles(this._trackEl, this._config.styles?.slider);
   this._applyIconStyles(this._config.styles?.icon);
   this._applyTipsStyles(this._config.styles?.tips);

   // 尺寸
   this._resizeObserver?.disconnect?.();
   this._resizeObserver = new ResizeObserver(() => { this._layout(); this._syncBarCornerRadius(); });
   this._resizeObserver.observe(this._trackEl);
   this._layout();
   this._syncBarCornerRadius();

   // 交互
   this._pointerDown = (e) => this._onPointerDown(e);
   this._pointerMove = (e) => this._onPointerMove(e);
   this._pointerUp = () => this._onPointerUp();
   this._repositionOnScroll = () => { if (this._isDragging) this._repositionBubblePortal(); };

   this._trackEl.addEventListener("pointerdown", this._pointerDown);

   // 滚动/缩放时也重算 portal 位置
   window.addEventListener("scroll", this._repositionOnScroll, true);
   window.addEventListener("resize", this._repositionOnScroll, true);

   // tap_action
   if (this._config.tap_action?.action === "perform-action" && this._config.perform_action) {
     this._tapPerformAction = this._config.tap_action.perform_action || this._config.perform_action;
   }

   // —— 抬起后抗抖（初始化一次）——
   if (this._stabilizeWindowMs == null) {
     this._stabilizeWindowMs = 250; // 抬起后 250ms 内过滤微小移动
     this._stabilizeJitterPx = 2;   // ≤2px 视为抖动
     this._lastStablePx = null;     // 最近稳定像素
     this._settleGuardUntil = 0;    // 保护窗口截止时间
   }
 }

 _ensurePortalStyleSheet() {
   if (document.getElementById("slider-mod-card-portal-style")) return;
   const s = document.createElement("style");
   s.id = "slider-mod-card-portal-style";
   s.textContent = `
     .slider-mod-bubble-portal {
       position: fixed;
       z-index: 2147483647; /* 置顶，避免被任何容器裁切 */
       padding: 6px 10px;
       border-radius: 14px;
       background: var(--slider-mod-bubble-bg, rgba(0,0,0,0.75));
       color: var(--slider-mod-bubble-fg, #fff);
       font-size: var(--slider-mod-bubble-font-size, 12px);
       line-height: 1;
       white-space: nowrap;
       pointer-events: none;
       opacity: 0;
       transform: translate(-50%, 0) scale(0.9);
       transition: opacity 120ms ease, transform 120ms ease;
     }
     .slider-mod-bubble-portal.show {
       opacity: 1;
       transform: translate(-50%, 0) scale(1);
     }
     .slider-mod-bubble-portal::after {
       content: "";
       position: absolute;
       left: 50%;
       transform: translateX(-50%);
       top: 100%;
       width: 0; height: 0;
       border-left: 6px solid transparent;
       border-right: 6px solid transparent;
       border-top: 6px solid var(--slider-mod-bubble-bg, rgba(0,0,0,0.75));
     }
   `;
   document.head.appendChild(s);
 }

 _setupBubblePortal() {
   this._ensurePortalStyleSheet();
   if (!this._bubblePortal) {
     this._bubblePortal = document.createElement("div");
     this._bubblePortal.className = "slider-mod-bubble-portal";
     document.body.appendChild(this._bubblePortal);
     // 同步颜色变量
     this._syncTipsVarsToPortal();
   }
 }
 _teardownBubblePortal() {
   if (this._bubblePortal?.parentNode) this._bubblePortal.parentNode.removeChild(this._bubblePortal);
   this._bubblePortal = null;
 }

 _syncTipsVarsToPortal() {
   if (!this._bubblePortal) return;
   const bg = this._bubbleEl.style.getPropertyValue("--slider-mod-bubble-bg");
   const fg = this._bubbleEl.style.getPropertyValue("--slider-mod-bubble-fg");
   const fs = this._bubbleEl.style.getPropertyValue("--slider-mod-bubble-font-size");
   if (bg) this._bubblePortal.style.setProperty("--slider-mod-bubble-bg", bg);
   if (fg) this._bubblePortal.style.setProperty("--slider-mod-bubble-fg", fg);
   if (fs) this._bubblePortal.style.setProperty("--slider-mod-bubble-font-size", fs);
 }

 _renderThumbIcon() {
   this._thumbEl.innerHTML = "";
   const iconStrRaw = this._evalMaybeTemplate(this._config.icon);
   const iconStr = iconStrRaw != null ? String(iconStrRaw).trim() : "";

   // 外壳颜色继承支持（styles.icon 里写 color 可控 ha-icon 颜色）
   // 注意：img 本身不吃 color，这里只影响 ha-icon。
   this._thumbEl.style.color = this._thumbEl.style.color || "inherit";

   if (iconStr && iconStr.startsWith("mdi:")) {
     const haIcon = document.createElement("ha-icon");
     // 同时设置 attribute 和 property，兼容某些版本的 ha-icon 实现
     haIcon.setAttribute("icon", iconStr);
     try { haIcon.icon = iconStr; } catch (_) {}

     // 明确尺寸变量，避免 24px 默认值导致“看起来不显示”
     haIcon.style.width = "100%";
     haIcon.style.height = "100%";
     haIcon.style.setProperty("--mdc-icon-size", "100%");
     // 颜色跟随外壳（可被 styles.icon 的 color 覆盖）
     haIcon.style.color = "inherit";

     this._thumbEl.appendChild(haIcon);
   } else if (iconStr) {
     const img = document.createElement("img");
     img.src = iconStr;
     img.alt = "thumb";
     img.style.width = "100%";
     img.style.height = "100%";
     this._thumbEl.appendChild(img);
   } else {
     // 兜底一个可见的图标，避免空白
     const haIcon = document.createElement("ha-icon");
     haIcon.setAttribute("icon", "mdi:circle");
     try { haIcon.icon = "mdi:circle"; } catch (_) {}
     haIcon.style.width = "100%";
     haIcon.style.height = "100%";
     haIcon.style.setProperty("--mdc-icon-size", "100%");
     haIcon.style.color = "inherit";
     this._thumbEl.appendChild(haIcon);
   }
 }


  _layout() {
    // 使用未被 transform 影响的宽度（offsetWidth），
    // 仅在为 0 时回退到 getBoundingClientRect()
    const trackRect = this._trackEl.getBoundingClientRect();
    const trackWidth = this._trackEl.offsetWidth || trackRect.width;
    this._trackWidth = trackWidth;

    const thumbRect = this._thumbEl.getBoundingClientRect();
    const thumbWidth = this._thumbEl.offsetWidth || thumbRect.width;
    this._thumbWidth = thumbWidth || 40;

    this._rangePx = Math.max(0, this._trackWidth - this._thumbWidth);

    this._positionFromValue(this._currentValue ?? this._min, false);
    this._paintBars(false);
    if (this._isDragging) this._repositionBubblePortal();
  }


 _valueToPx(value) {
   const ratio = (value - this._min) / (this._max - this._min || 1);
   return this._thumbWidth / 2 + this._rangePx * this._clamp01(ratio);
 }
 _pxToValue(px) {
   const ratio = (px - this._thumbWidth / 2) / (this._rangePx || 1);
   const raw = this._min + this._clamp01(ratio) * (this._max - this._min);
   return this._clampStep(raw);
 }

 _positionFromValue(value, animate = true) {
   const px = this._valueToPx(value);
   this._setThumbLeft(px, animate);
   this._updateBubbleText(`${value}`);
   // portal 位置随之变更
   if (this._isDragging) this._positionBubblePortalByPx(px);
 }

 // ====== 抗抖 / 像素对齐工具 ======
 _snapPx(px) {
   const dpr = window.devicePixelRatio || 1;
   return Math.round(px * dpr) / dpr;
 }
 _shouldStick(px) {
   if (this._isDragging) return false;
   if (performance.now() > this._settleGuardUntil) return false;
   if (this._lastStablePx == null) return false;
   return Math.abs(px - this._lastStablePx) <= this._stabilizeJitterPx;
 }

 _setThumbLeft(px, animate) {
   // 子像素对齐 + 抬起后吸附到稳定像素
   let x = this._snapPx(px);
   if (this._shouldStick(x)) x = this._lastStablePx;
   this._thumbEl.classList.toggle("anim-off", !animate);
   this._thumbEl.style.left = `${x}px`;
   if (!this._isDragging) this._lastStablePx = x;
 }

 _setValueAnimated(v) {
   this._currentValue = this._clampStep(v);
   this._positionFromValue(this._currentValue, true);
   this._paintBars(true);
 }

 _paintBars(animate = false) {
   let px = this._valueToPx(this._currentValue ?? this._min);
   px = this._snapPx(px);
   if (this._shouldStick(px)) px = this._lastStablePx;

   const leftColor = this._evalMaybeTemplate(this._config.bar_left_color) || "yellow";
   const rightColor = this._evalMaybeTemplate(this._config.bar_right_color) || "gray";
   const leftW = Math.max(px, 0);
   const rightW = Math.max(this._trackWidth - px, 0);
   const animOff = this._isDragging || !animate;
   this._leftBar.classList.toggle("anim-off", animOff);
   this._rightBar.classList.toggle("anim-off", animOff);
   this._leftBar.style.left = "0px";
   this._leftBar.style.width = `${leftW}px`;
   this._leftBar.style.background = leftColor;
   this._rightBar.style.width = `${rightW}px`;
   this._rightBar.style.left = `${px}px`;
   this._rightBar.style.background = rightColor;

   if (!this._isDragging) this._lastStablePx = px;
 }

 _syncBarCornerRadius() {
   const cs = getComputedStyle(this._trackEl);
   const tl = cs.borderTopLeftRadius || "0px";
   const tr = cs.borderTopRightRadius || "0px";
   const bl = cs.borderBottomLeftRadius || "0px";
   const br = cs.borderBottomRightRadius || "0px";
   this._leftBar.style.borderTopLeftRadius = tl;
   this._leftBar.style.borderBottomLeftRadius = bl;
   this._leftBar.style.borderTopRightRadius = "0px";
   this._leftBar.style.borderBottomRightRadius = "0px";
   this._rightBar.style.borderTopRightRadius = tr;
   this._rightBar.style.borderBottomRightRadius = br;
   this._rightBar.style.borderTopLeftRadius = "0px";
   this._rightBar.style.borderBottomLeftRadius = "0px";
 }

 // —— 交互（使用 portal 气泡） ——
 _onPointerDown(e) {
   e.preventDefault();
   this._isDragging = true;
   this._settleGuardUntil = 0; // 拖动中关闭抗抖

   // 关闭过渡
   this._thumbEl.classList.add("anim-off");
   this._leftBar.classList.add("anim-off");
   this._rightBar.classList.add("anim-off");

   // 准备 portal
   this._setupBubblePortal();
   this._bubblePortal.classList.add("show");

   this._dragRAF && cancelAnimationFrame(this._dragRAF);
   const trackLeft = this._trackEl.getBoundingClientRect().left;

   const updateFromX = (clientX) => {
     const px = Math.min(
       Math.max(clientX - trackLeft, this._thumbWidth / 2),
       this._trackWidth - this._thumbWidth / 2
     );
     const v = this._pxToValue(px);
     this._currentValue = v;
     this._setThumbLeft(px, false); // 跟手（无过渡，带对齐）
     this._updateBubbleText(`${v}`);
     this._positionBubblePortalByPx(px);
     this._paintBars(false);
   };

   const x0 = e.clientX ?? (e.touches?.[0]?.clientX);
   updateFromX(x0);

   this._dragTicking = false;
   this._lastMoveX = x0;

   window.addEventListener("pointermove", this._pointerMove);
   window.addEventListener("pointerup", this._pointerUp);
   window.addEventListener("pointercancel", this._pointerUp);
 }

 _onPointerMove(e) {
   if (!this._isDragging) return;
   const x = e.clientX ?? (e.touches?.[0]?.clientX);
   this._lastMoveX = x;
   if (!this._dragTicking) {
     this._dragTicking = true;
     this._dragRAF = requestAnimationFrame(() => {
       this._dragTicking = false;
       const trackLeft = this._trackEl.getBoundingClientRect().left;
       const px = Math.min(
         Math.max(this._lastMoveX - trackLeft, this._thumbWidth / 2),
         this._trackWidth - this._thumbWidth / 2
       );
       const v = this._pxToValue(px);
       this._currentValue = v;
       this._setThumbLeft(px, false);
       this._updateBubbleText(`${v}`);
       this._positionBubblePortalByPx(px);
       this._paintBars(false);
     });
   }
 }

 _onPointerUp() {
   if (!this._isDragging) return;
   this._isDragging = false;

   this._lastUserSetTime = Date.now(); // 1s 外部同步抑制
   this._invokeTapActionWithValue(this._currentValue);

   // 开启抬起后保护窗口
   this._settleGuardUntil = performance.now() + this._stabilizeWindowMs;

   // 300ms 后隐藏并释放 portal
   const portal = this._bubblePortal;
   if (portal) {
     portal.classList.remove("show");
     setTimeout(() => { if (portal === this._bubblePortal) this._teardownBubblePortal(); }, 300);
   }

   // 恢复动画
   this._thumbEl.classList.remove("anim-off");
   this._leftBar.classList.remove("anim-off");
   this._rightBar.classList.remove("anim-off");

   // 收尾：当前值重绘一次（带过渡、带对齐&抗抖）
   this._positionFromValue(this._currentValue, true);
   this._paintBars(true);

   // 清理
   this._dragRAF && cancelAnimationFrame(this._dragRAF);
   window.removeEventListener("pointermove", this._pointerMove);
   window.removeEventListener("pointerup", this._pointerUp);
   window.removeEventListener("pointercancel", this._pointerUp);
 }

 // —— portal 定位与文本 ——
 _updateBubbleText(text) {
   if (this._bubblePortal) this._bubblePortal.textContent = text;
 }

 _parseGapPx() {
   // 从 tips 的 --bubble-gap 解析像素（默认 10）
   const v = this._bubbleEl.style.getPropertyValue("--bubble-gap") || "10px";
   const n = parseFloat(v);
   return Number.isFinite(n) ? n : 10;
 }

 _positionBubblePortalByPx(px) {
   // px：拇指中心相对于 track 左侧的像素
   if (!this._bubblePortal) return;
   const gap = this._parseGapPx();
   const trackRect = this._trackEl.getBoundingClientRect();
   // 先设置文本，测量高度
   const portal = this._bubblePortal;
   // 先放在屏幕内临时位置以获得高度
   portal.style.left = `${trackRect.left + px}px`;
   portal.style.top = `0px`;
   const h = portal.offsetHeight || 24; // 粗略备选
   const top = trackRect.top - gap - h;
   portal.style.left = `${trackRect.left + px}px`;
   portal.style.top = `${Math.max(0, top)}px`;
 }

 _repositionBubblePortal() {
   if (!this._isDragging) return;
   // 根据当前 value 重新算 px（对齐后再定位）
   const px = this._snapPx(this._valueToPx(this._currentValue ?? this._min));
   this._positionBubblePortalByPx(px);
 }

 _invokeTapActionWithValue(value) {
   const ta = this._config.tap_action || {};
   if (!this._hass || ta.action !== "perform-action") return;
   const perform = ta.perform_action || this._config.perform_action;
   if (!perform) return;

   const target = ta.target ? JSON.parse(JSON.stringify(ta.target)) : undefined;
   let data = ta.data ? JSON.parse(JSON.stringify(ta.data)) : {};
   const replaceValueRange = (obj) => {
     if (obj == null) return obj;
     if (typeof obj === "string") return obj === "value_range" ? value : obj;
     if (Array.isArray(obj)) return obj.map(replaceValueRange);
     if (typeof obj === "object") {
       const out = {};
       for (const k of Object.keys(obj)) out[k] = replaceValueRange(obj[k]);
       return out;
     }
     return obj;
   };
   data = replaceValueRange(data);

   const [domain, service] = perform.split(".");
   this._hass.callService(domain, service, data, target).catch((e) => {
     console.warn("slider-mod-card service call failed:", e);
   });
 }

 // —— 模板 & 工具函数 ——
 _evalMaybeTemplate(val) {
   if (val == null) return null;
   if (!this._hass || !this._hass.states) return null;
   const str = String(val).trim();
   const isTpl = str.startsWith("[[[") && str.endsWith("]]]");
   if (!isTpl) return val;
   const code = str.slice(3, -3);
   try {
     const safeStates = this._getSafeStates();
     const fn = new Function("hass", "states", "user", "entity", "variables", `"use strict";\n${code}`);
     const entity = undefined;
     const variables = {};
     return fn(this._hass, safeStates, this._hass.user, entity, variables);
   } catch (e) {
     console.warn("slider-mod-card template error:", e);
     return null;
   }
 }

 _getSafeStates() {
   const base = this._hass?.states || {};
   const handler = {
     get(target, prop) {
       if (prop in target) return target[prop];
       return { state: undefined, attributes: {} };
     },
     has() { return true; }
   };
   return new Proxy(base, handler);
 }

 _toNumber(v, fallback=null) {
   if (v == null) return fallback;
   const n = Number(v);
   return Number.isFinite(n) ? n : fallback;
 }

 _clampStep(v) {
   const clamped = Math.min(this._max, Math.max(this._min, Number(v)));
   const s = this._step || 1;
   const stepped = this._min + Math.round((clamped - this._min) / s) * s;
   return Number.isFinite(stepped) ? stepped : this._min;
 }

 _clamp01(x) { return Math.min(1, Math.max(0, x)); }

 _applyInlineStyles(el, stylesArr) {
   if (!el || !stylesArr) return;
   const styleStr = stylesArr
     .map(obj => {
       const k = Object.keys(obj || {})[0];
       const v = obj?.[k];
       return k && (v !== undefined) ? `${k}:${v}` : null;
     })
     .filter(Boolean)
     .join(";");
   if (styleStr) el.style.cssText += (el.style.cssText ? ";" : "") + styleStr;
 }

 _applyIconStyles(stylesArr) {
   this._applyInlineStyles(this._thumbEl, stylesArr);
   if (Array.isArray(stylesArr)) {
     for (const obj of stylesArr) {
       const k = Object.keys(obj || {})[0];
       const v = obj?.[k];
       if (!k) continue;
       const key = k.toLowerCase();
       if (key === "width") this._thumbEl.style.setProperty("--thumb-w", v);
       if (key === "height") this._thumbEl.style.setProperty("--thumb-h", v);
     }
   }
 }

 _applyTipsStyles(stylesArr) {
   // 打到本地 bubble（变量载体）
   this._applyInlineStyles(this._bubbleEl, stylesArr);

   // 解析 gap & 颜色并同步到 portal 变量
   let gap = null, bg = null, fg = null, fs = null;
   if (Array.isArray(stylesArr)) {
     for (const obj of stylesArr) {
       const k = Object.keys(obj || {})[0];
       const v = obj?.[k];
       if (!k) continue;
       const key = k.toLowerCase();
       if (key === "margin-top") gap = v;
       if (key === "margin-bottom" && gap == null) gap = v;
       if (key === "background" || key === "background-color") bg = v;
       if (key === "color") fg = v;
       if (key === "font-size") fs = v;
     }
   }
   if (gap) this._bubbleEl.style.setProperty("--bubble-gap", gap);
   if (bg) this._bubbleEl.style.setProperty("--slider-mod-bubble-bg", bg);
   if (fg) this._bubbleEl.style.setProperty("--slider-mod-bubble-fg", fg);
   if (fs) this._bubbleEl.style.setProperty("--slider-mod-bubble-font-size", fs);

   // 若 portal 已存在，同步变量
   this._syncTipsVarsToPortal();
 }
}

customElements.define("slider-mod-card", SliderModCard);
