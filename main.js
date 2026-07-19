/**
 * 地铁PIDS显示器模拟器 - 主脚本
 * 单线路模式 + 车站编辑 + 站名显示
 */

// ========== 配置 ==========
const CONFIG = {
    minLength: 10,
    maxLength: 300,
    defaultLength: 300,
    defaultColor: '#e94560',
    minStrokeWidth: 1,
    maxStrokeWidth: 20,
    defaultStrokeWidth: 5,
    minPositionY: 0,
    maxPositionY: 1,
    defaultPositionY: 0.5,
    minIconSize: 2,
    maxIconSize: 10,
    defaultIconSize: 4,
    minNameFontSize: 2,
    maxNameFontSize: 8,
    defaultNameFontSize: 4,
    defaultNameDisplayMode: 'alternating',
    defaultBannerTextColor: '#ffffff',
    defaultStationNameColor: '#ffffff',
    defaultTrainFormation: '1,1\n2,0\n3,0\n4,0\n5,0\n6,-1',
    defaultStopPosition: 'center',
    defaultDirection: 'left',
    defaultArrowScaleW: 1.0,
    defaultArrowScaleH: 1.0,
    defaultArrowColor: '#ffffff',
    defaultArrowBlinkSpeed: 300,
    defaultArrowStrokeWidth: 4
};

const VIEWBOX_HEIGHT = 69.5;  // 1920:445 = 300*445/1920 ≈ 69.5 (banner=95)

/**
 * getLineY - 将线路位置比例 (0~1) 换算为 viewBox Y 坐标
 *
 * 0 = 最靠上, 1 = 最靠下。
 *
 * @returns {number} 线路矩形顶边的 viewBox Y 坐标
 */
function getLineY() {
    return line.positionY * (VIEWBOX_HEIGHT - line.strokeWidth);
}

// ========== 线路状态（单线路） ==========
const line = {
    color: CONFIG.defaultColor,
    length: CONFIG.defaultLength,
    strokeWidth: CONFIG.defaultStrokeWidth,
    positionY: CONFIG.defaultPositionY,
    iconSize: CONFIG.defaultIconSize,
    nameFontSize: CONFIG.defaultNameFontSize,
    nameDisplayMode: CONFIG.defaultNameDisplayMode,
    bannerTextColor: CONFIG.defaultBannerTextColor,
    stationNameColor: CONFIG.defaultStationNameColor,
    trainFormation: CONFIG.defaultTrainFormation,
    stopPosition: CONFIG.defaultStopPosition,
    direction: CONFIG.defaultDirection,
    arrowScaleW: CONFIG.defaultArrowScaleW,
    arrowScaleH: CONFIG.defaultArrowScaleH,
    arrowColor: CONFIG.defaultArrowColor,
    arrowBlinkSpeed: CONFIG.defaultArrowBlinkSpeed,
    arrowStrokeWidth: CONFIG.defaultArrowStrokeWidth
};

// ========== 车站状态 ==========
let stations = [];
let stationCounter = 0;
let dragStationId = null;  // 当前拖拽中的车站 ID

// ========== 画面切换状态 ==========
let currentStationIndex = -1;  // -1 = 无高亮，0+ = 高亮车站索引
let isDeparted = false;         // 是否已从当前站发车（区间运行中）
let isAutoRunning = false;
let autoRunIntervalId = null;
const AUTO_RUN_DELAY = 3000;   // 自动运行间隔（毫秒）

// ========== 换乘切换状态 ==========
let transferToggle = false;          // false=普通态, true=换乘态
let transferToggleTimer = null;      // 3 秒间隔定时器
let arrowFrame = 0;                  // 箭头动画帧 (0, 1, 2)
let arrowAnimTimer = null;           // 300ms 箭头动画定时器
const ARROW_ANIM_DELAY = 300;        // 箭头动画帧切换间隔（毫秒）
let currentStationBlink = true;      // 当前站黄色闪烁状态（on/off）
let currentStationBlinkTimer = null; // 当前站闪烁定时器
const CURRENT_STATION_BLINK_DELAY = 500; // 当前站闪烁间隔（毫秒）

// ========== 时间状态 ==========
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const now = new Date();
const timeState = {
    useSystemTime: true,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes()
};

/**
 * getDisplayTime - 获取当前应显示的时间对象
 * @returns {Date} 根据 useSystemTime 返回系统时间或用户自定义时间
 */
function getDisplayTime() {
    if (timeState.useSystemTime) {
        return new Date();
    }
    return new Date(timeState.year, timeState.month - 1, timeState.day, timeState.hour, timeState.minute);
}

/**
 * formatTime - 将 Date 格式化为 HH:MM
 * @param {Date} d
 * @returns {string}
 */
function formatTimeHM(d) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

/**
 * getDayOfWeek - 获取星期几的中文简称
 * @param {Date} d
 * @returns {string}
 */
function getDayOfWeek(d) {
    return DAY_NAMES[d.getDay()];
}

/**
 * updateTimeDisplay - 刷新时间控件的星期显示
 */
function updateTimeDisplay() {
    const d = getDisplayTime();
    const dowEl = document.getElementById('timeDayOfWeek');
    if (dowEl) dowEl.textContent = `周${getDayOfWeek(d)}`;
}

// ========== PIDS 背景状态 ==========
const pidsBackground = {
    type: 'color',       // 'color' | 'image'
    color: '#ffffff',    // 纯色值
    image: null,         // 图片 data URL
    imageSize: 'cover',  // 'cover' | 'contain' | 'tile'
    imageOpacity: 0.5     // 纹理图片透明度 0~1，默认 50%
};

// ========== 状态持久化 ==========
const STORAGE_KEY = 'pids-simulator-state';
const SAVE_DEBUG = false;  // 诊断保存问题时开启，确认正常后改 false
let saveReady = false;
let saveTimer = null;
let autoSaveIntervalId = null;

/**
 * saveState - 将当前状态序列化到 localStorage
 *
 * 保存 line、stations、stationCounter、timeState、pidsBackground。
 * 注意：pidsBackground.image（背景纹理 data URL）不保存——
 * data URL 动辄数 MB，会轻易超出 localStorage 5-10MB 配额，
 * 导致线上环境（https://）保存静默失败。
 * 图片设置（type/color/imageSize/imageOpacity）仍保留，
 * 下次打开时用户重新上传图片即可。
 *
 * 依赖: saveReady, STORAGE_KEY, pidsBackground, CONFIG
 */
function saveState() {
    if (!saveReady) {
        if (SAVE_DEBUG) console.log('[PIDS] saveState 跳过：saveReady=false（初始化未完成）');
        return;
    }

    // 剥离背景图片的 data URL（体积过大，不持久化）
    const bgForSave = { ...pidsBackground };
    delete bgForSave.image;

    const state = {
        line: { ...line },
        stations: stations.slice(),
        stationCounter,
        timeState: { ...timeState },
        pidsBackground: bgForSave,
        currentStationIndex,
        isDeparted
    };

    let payload;
    try {
        payload = JSON.stringify(state);
    } catch (e) {
        console.warn('[PIDS] 序列化状态失败 (' + (e.name || 'Error') + '):', e.message);
        return;
    }

    try {
        localStorage.setItem(STORAGE_KEY, payload);
        if (SAVE_DEBUG) console.log('[PIDS] ✅ 已保存 ' + stations.length + ' 个车站, ' +
            '线路色=' + line.color + ', ' +
            '车站索引=' + currentStationIndex + ', ' +
            '大小=' + (payload.length / 1024).toFixed(1) + 'KB');
    } catch (e) {
        console.warn('[PIDS] localStorage 保存失败 (' + (e.name || 'Error') + '):', e.message);

        // 配额超限时尝试压缩：移除旧数据中的 image 残留后重试
        if (e.name === 'QuotaExceededError') {
            const existing = localStorage.getItem(STORAGE_KEY);
            if (existing) {
                try {
                    const old = JSON.parse(existing);
                    if (old.pidsBackground && old.pidsBackground.image) {
                        delete old.pidsBackground.image;
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
                        // 空间释放后重新尝试本次写入
                        try { localStorage.setItem(STORAGE_KEY, payload); } catch (_) {}
                    }
                } catch (_) {}
            }
        }
    }
}

/**
 * scheduleSave - 防抖保存（300ms 内多次调用只写一次）
 */
function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 300);
}

/**
 * loadState - 从 localStorage 恢复状态
 *
 * 恢复后自动剥离 pidsBackground.image 字段——
 * 背景纹理图的 data URL 不持久化，避免撑爆 localStorage 配额。
 * 旧版数据中可能残留的 image 也会在此清除。
 *
 * @returns {boolean} 是否成功恢复
 */
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            if (SAVE_DEBUG) console.log('[PIDS] loadState：localStorage 中无缓存数据，使用默认配置');
            return false;
        }
        const state = JSON.parse(raw);
        if (SAVE_DEBUG) console.log('[PIDS] loadState：读取到缓存, ' +
            (state.stations ? state.stations.length : 0) + ' 个车站, ' +
            '大小=' + (raw.length / 1024).toFixed(1) + 'KB');
        if (state.line) {
            Object.assign(line, state.line);
            // 迁移旧版 positionY 整数值 (0~30) → 比例值 (0~1)
            if (line.positionY > 1) {
                line.positionY = Math.min(1, Math.max(0, line.positionY / 60));
            }
            // 迁移旧版 defaultLength: 100/280 → 300
            if (line.length === 100 || line.length === 280) {
                line.length = CONFIG.defaultLength;
            }
        }
        if (state.stations) stations = state.stations.slice();
        if (state.stationCounter !== undefined) stationCounter = state.stationCounter;
        // 迁移：确保旧数据中所有车站都有 transferLines 字段，且类型与换乘数据一致
        stations.forEach(s => {
            if (!s.transferLines) s.transferLines = [];
            if (s.transferLines.length > 0) s.type = '换乘站';
            // 迁移旧 transferLine 数据：补充默认字号字段
            s.transferLines.forEach(tl => {
                if (tl.cnFontSize == null) tl.cnFontSize = 3.0;
                if (tl.enFontSize == null) tl.enFontSize = 2.0;
            });
        });
        if (state.timeState) Object.assign(timeState, state.timeState);
        if (state.pidsBackground) {
            Object.assign(pidsBackground, state.pidsBackground);
            // 剥离旧版数据中可能残留的 image data URL（体积过大，不恢复）
            pidsBackground.image = null;
            // 之前保存为 image 模式但 image 已被清除时，回退为纯色模式
            if (pidsBackground.type === 'image') {
                pidsBackground.type = 'color';
            }
        }
        if (state.currentStationIndex !== undefined) currentStationIndex = state.currentStationIndex;
        if (state.isDeparted !== undefined) isDeparted = state.isDeparted;
        return true;
    } catch (e) {
        console.warn('[PIDS] localStorage 读取失败，将使用默认配置:', e.message);
        return false;
    }
}

/**
 * exportConfig - 导出当前配置为 JSON 文件
 *
 * 收集线路、车站、背景等全部配置（不包括背景图片的 data URL），
 * 导出为带时间戳的 JSON 文件供用户保存分享。
 *
 * 依赖: line, stations, stationCounter, timeState, pidsBackground (全局)
 */
function exportConfig() {
    const bgForExport = { ...pidsBackground };
    delete bgForExport.image;

    const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        line: { ...line },
        stations: stations.slice(),
        stationCounter,
        timeState: { ...timeState },
        pidsBackground: bgForExport
    };

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `PIDS_${ts}.json`;

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * importConfig - 从 JSON 文件导入配置
 *
 * 读取用户选择的 JSON 文件，解析并应用配置。
 * 导入前不备份当前状态，如需撤销请先手动导出。
 *
 * 依赖: importConfigInput (DOM), line, stations, stationCounter, timeState, pidsBackground (全局)
 */
function importConfig(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.line || !data.stations) {
                alert('无效的配置文件：缺少 line 或 stations 数据。');
                return;
            }

            // 应用线路配置
            Object.assign(line, data.line);

            // 应用车站
            stations = data.stations.slice();
            stationCounter = data.stationCounter || stations.length;

            // 应用时间状态
            if (data.timeState) {
                Object.assign(timeState, data.timeState);
                syncTimeInputsToState();
            }

            // 应用背景（不含图片 data URL）
            if (data.pidsBackground) {
                Object.assign(pidsBackground, data.pidsBackground);
                pidsBackground.image = null;
                if (pidsBackground.type === 'image') {
                    pidsBackground.type = 'color';
                }
            }

            // 重置画面状态
            currentStationIndex = -1;
            isDeparted = false;
            transferToggle = false;
            currentStationBlink = true;

            // 先持久化数据，防止后续 UI 同步出错导致状态丢失
            scheduleSave();

            // 刷新 UI
            pauseAutoRun();

            // 同步线路控件
            colorInput.value = line.color;
            colorPreview.style.backgroundColor = line.color;
            bannerTextColorSelect.value = line.bannerTextColor;
            stationNameColorInput.value = line.stationNameColor;
            stationNameColorPreview.style.backgroundColor = line.stationNameColor;
            lengthInput.value = line.length;
            lengthValue.textContent = line.length;
            strokeInput.value = line.strokeWidth;
            strokeValue.textContent = line.strokeWidth;
            positionInput.value = line.positionY;
            positionValue.textContent = line.positionY.toFixed(2);
            iconSizeInput.value = line.iconSize;
            iconSizeValue.textContent = line.iconSize;
            nameModeSelect.value = line.nameDisplayMode;
            nameFontSizeInput.value = line.nameFontSize;
            nameFontSizeValue.textContent = line.nameFontSize;
            trainFormationInput.value = line.trainFormation;
            stopPositionSelect.value = line.stopPosition;
            directionSelect.value = line.direction;
            arrowScaleWInput.value = line.arrowScaleW;
            arrowScaleWValue.textContent = line.arrowScaleW.toFixed(1);
            arrowScaleHInput.value = line.arrowScaleH;
            arrowScaleHValue.textContent = line.arrowScaleH.toFixed(1);
            arrowColorInput.value = line.arrowColor;
            arrowColorPreview.style.backgroundColor = line.arrowColor;
            arrowBlinkInput.value = line.arrowBlinkSpeed;
            arrowBlinkValue.textContent = line.arrowBlinkSpeed;
            arrowStrokeWidthInput.value = line.arrowStrokeWidth;
            arrowStrokeWidthValue.textContent = line.arrowStrokeWidth;

            // 同步背景控件
            pidsBgType.value = pidsBackground.type;
            pidsBgColorInput.value = pidsBackground.color;
            pidsBgColorPreview.style.backgroundColor = pidsBackground.color;
            if (pidsBackground.type === 'image') {
                pidsBgColorGroup.classList.add('pids-bg-hidden');
                pidsBgImageGroup.classList.remove('pids-bg-hidden');
                pidsBgSizeRow.style.display = 'block';
                pidsBgImageSize.value = pidsBackground.imageSize;
            } else {
                pidsBgColorGroup.classList.remove('pids-bg-hidden');
                pidsBgImageGroup.classList.add('pids-bg-hidden');
                pidsBgSizeRow.style.display = 'none';
            }
            pidsBgOpacityInput.value = Math.round(pidsBackground.imageOpacity * 100);
            pidsBgOpacityValue.textContent = Math.round(pidsBackground.imageOpacity * 100);

            useSystemTimeCheck.checked = timeState.useSystemTime;
            setTimeInputsState();

            rebuildStationList();
            updatePlaybackButtons();
            renderBanner();
            renderPIDSDisplay();
            applyPidsBackground();

        } catch (err) {
            console.error('[PIDS] 导入失败:', err);
            alert('配置文件解析失败：' + err.message);
        }
    };
    reader.readAsText(file);
}

// ========== DOM 引用 ==========
const colorInput = document.getElementById('colorInput');
const colorPreview = document.getElementById('colorPreview');
const bannerTextColorSelect = document.getElementById('bannerTextColorSelect');
const stationNameColorInput = document.getElementById('stationNameColorInput');
const stationNameColorPreview = document.getElementById('stationNameColorPreview');
const useSystemTimeCheck = document.getElementById('useSystemTimeCheck');
const timeInputs = document.getElementById('timeInputs');
const timeYear = document.getElementById('timeYear');
const timeMonth = document.getElementById('timeMonth');
const timeDay = document.getElementById('timeDay');
const timeHour = document.getElementById('timeHour');
const timeMinute = document.getElementById('timeMinute');
const lengthInput = document.getElementById('lengthInput');
const lengthValue = document.getElementById('lengthValue');
const strokeInput = document.getElementById('strokeInput');
const strokeValue = document.getElementById('strokeValue');
const positionInput = document.getElementById('positionInput');
const positionValue = document.getElementById('positionValue');
const iconSizeInput = document.getElementById('iconSizeInput');
const iconSizeValue = document.getElementById('iconSizeValue');
const nameModeSelect = document.getElementById('nameModeSelect');
const nameFontSizeInput = document.getElementById('nameFontSizeInput');
const nameFontSizeValue = document.getElementById('nameFontSizeValue');
const trainFormationInput = document.getElementById('trainFormationInput');
const stopPositionSelect = document.getElementById('stopPositionSelect');
const directionSelect = document.getElementById('directionSelect');
const arrowScaleWInput = document.getElementById('arrowScaleWInput');
const arrowScaleWValue = document.getElementById('arrowScaleWValue');
const arrowScaleHInput = document.getElementById('arrowScaleHInput');
const arrowScaleHValue = document.getElementById('arrowScaleHValue');
const arrowColorInput = document.getElementById('arrowColorInput');
const arrowColorPreview = document.getElementById('arrowColorPreview');
const arrowBlinkInput = document.getElementById('arrowBlinkInput');
const arrowBlinkValue = document.getElementById('arrowBlinkValue');
const arrowStrokeWidthInput = document.getElementById('arrowStrokeWidthInput');
const arrowStrokeWidthValue = document.getElementById('arrowStrokeWidthValue');
const pidsLineTrack = document.getElementById('pidsLineTrack');
const pidsBanner = document.getElementById('pidsBanner');
const addStationBtn = document.getElementById('addStationBtn');
const resetStationBtn = document.getElementById('resetStationBtn');
const reverseStationBtn = document.getElementById('reverseStationBtn');
const resetLineBtn = document.getElementById('resetLineBtn');
const exportConfigBtn = document.getElementById('exportConfigBtn');
const importConfigBtn = document.getElementById('importConfigBtn');
const importConfigInput = document.getElementById('importConfigInput');
const stationList = document.getElementById('stationList');
const pidsSection = document.querySelector('.pids-section');
const pidsWrapper = document.querySelector('.pids-display-wrapper');
const pidsDisplay = document.querySelector('.pids-display');
const pidsBgLayer = document.getElementById('pidsBgLayer');
const pidsBgType = document.getElementById('pidsBgType');
const pidsBgColorGroup = document.getElementById('pidsBgColorGroup');
const pidsBgColorInput = document.getElementById('pidsBgColorInput');
const pidsBgColorPreview = document.getElementById('pidsBgColorPreview');
const pidsBgImageGroup = document.getElementById('pidsBgImageGroup');
const pidsBgImageInput = document.getElementById('pidsBgImageInput');
const pidsBgSizeRow = document.getElementById('pidsBgSizeRow');
const pidsBgImageSize = document.getElementById('pidsBgImageSize');
const pidsBgClearImage = document.getElementById('pidsBgClearImage');
const pidsBgOpacityInput = document.getElementById('pidsBgOpacityInput');
const pidsBgOpacityValue = document.getElementById('pidsBgOpacityValue');
const btnGoToStart = document.getElementById('btnGoToStart');
const btnPrevStep = document.getElementById('btnPrevStep');
const btnAutoRun = document.getElementById('btnAutoRun');
const btnNextStep = document.getElementById('btnNextStep');

// ========== PIDS 尺寸计算 ==========

/**
 * 根据可用空间计算 PIDS 最佳尺寸，保持 32:9 比例
 * 直到宽度或高度某一边填满
 */
function resizePIDS() {
    if (!pidsSection || !pidsWrapper) return;

    // 获取 .pids-section 的可用空间（扣除 padding）
    const style = getComputedStyle(pidsSection);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;

    const availW = pidsSection.clientWidth - padLeft - padRight;
    const availH = pidsSection.clientHeight - padTop - padBottom;

    // 1920:540 比例（CSS aspect-ratio 负责等比缩放）
    const RATIO_W = 1920, RATIO_H = 540;
    const hFromW = availW * RATIO_H / RATIO_W;

    if (hFromW <= availH) {
        // 宽度先达到限制：设宽度，高度由 CSS aspect-ratio 自动计算
        pidsWrapper.style.width = availW + 'px';
        pidsWrapper.style.height = 'auto';
    } else {
        // 高度先达到限制：设高度，宽度由 CSS aspect-ratio 自动计算
        pidsWrapper.style.height = availH + 'px';
        pidsWrapper.style.width = 'auto';
    }
}

// ========== 站名 SVG 生成 ==========

const FONT_FAMILY = "SimHei, '黑体', 'Microsoft YaHei', sans-serif";
const TEXT_PAD = 2;  // 文字与站点圆圈的间距（viewBox 单位）
const VERT_LETTER_SPACING = '0em';  // 竖排模式下字符间距（负值=收紧，正值=拉开）

/**
 * estimateStationExtent - 估算站点+站名在水平方向超出 cx 的距离
 *
 * 用于边界感知排布：当文本不超出 viewBox 时起终点对齐线路端头，
 * 当文本或圆圈触及边界时该侧边缘对齐 viewBox。
 *
 * @param  {Object} station - 车站数据
 * @param  {number} index   - 车站索引
 * @returns {{ left: number, right: number }} 左侧和右侧超出 cx 的距离（非负）
 *
 * 依赖: line (全局), TEXT_PAD (全局)
 */
function estimateStationExtent(station, index) {
    const cnName = (station.name || '').trim();
    const secName = (station.secondaryName || '').trim();
    const cnSize = line.nameFontSize;
    const secSize = cnSize / 2;
    const halfIcon = line.iconSize / 2;

    // 站点圆圈始终占 halfIcon
    let left = halfIcon;
    let right = halfIcon;

    if (!cnName && !secName) return { left, right };

    const cnLen = cnName.length;
    const secLen = secName.length;
    const cnWidth = cnLen * cnSize;         // CJK 字符近似等宽（字面≈字号）
    const secWidth = secLen * secSize * 0.6; // 拉丁字符平均宽度 ≈ 字号 × 0.6
    const textWidth = Math.max(cnWidth, secWidth);

    switch (line.nameDisplayMode) {
        case 'alternating': {
            // text-anchor="middle"，文本水平居中于 cx
            const halfText = textWidth / 2;
            left = Math.max(left, halfText);
            right = Math.max(right, halfText);
            break;
        }
        case 'diagonal': {
            // text-anchor="start"，从 cx+offset 开始向右上 45°
            const offset = halfIcon + 3;  // 与 buildDiagonalText 保持一致
            right = Math.max(right, (offset + textWidth) * 0.707);
            break;
        }
        case 'above':
        case 'below': {
            // 竖排：中文在左列 (cx - colGap)，英文在右列 (cx + colGap)
            const colGap = cnSize * 0.4;
            if (cnLen && secLen) {
                // 双语：中文列左边缘 = cx - colGap，英文列右边缘 = cx + colGap + secSize
                left = Math.max(left, colGap);
                right = Math.max(right, colGap + secSize);
            } else if (cnLen) {
                // 仅中文：列居中于 cx
                left = Math.max(left, 0);
                right = Math.max(right, cnSize);
            } else if (secLen) {
                // 仅英文：列在 cx + colGap 处（与双语时英文列位置相同）
                left = Math.max(left, 0);
                right = Math.max(right, colGap + secSize);
            }
            break;
        }
    }

    return { left, right };
}

/**
 * 横向上下交错式 — 文字水平排列，偶数在上、奇数在下
 */
function buildAlternatingText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, index, isPassed) {
    const isAbove = index % 2 === 0;
    const hasSec = !!secName;
    const gap = hasSec ? Math.max(1, secSize * 0.3) : 0;
    const textColor = isPassed ? '#999' : line.stationNameColor;

    // 最靠近站点的行基线
    let cnY, secY;
    if (isAbove) {
        // 文字块在站点上方：secondary(如有)最靠近站点 → 中文在上
        if (hasSec) {
            secY = cy - halfIcon - TEXT_PAD;
            cnY = secY - secSize - gap;
        } else {
            cnY = cy - halfIcon - TEXT_PAD;
        }
    } else {
        // 文字块在站点下方：中文最靠近站点 → secondary(如有)在下
        cnY = cy + halfIcon + TEXT_PAD + cnSize;
        if (hasSec) {
            secY = cnY + secSize + gap;
        }
    }

    let svg = `<text text-anchor="middle" x="${cx}" y="${cnY}" font-size="${cnSize}" font-family="${FONT_FAMILY}" fill="${textColor}">${cnName}`;
    if (hasSec) {
        const dy = secY - cnY;
        svg += `<tspan x="${cx}" dy="${dy}" font-size="${secSize}">${secName}</tspan>`;
    }
    svg += `</text>`;
    return svg;
}

/**
 * 右上角斜45°式 — 文字沿45°方向延伸
 */
function buildDiagonalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, isPassed) {
    const hasSec = !!secName;
    const gap = hasSec ? secSize * 0.1 : 0;
    const offset = halfIcon + 3;  // 贴近站点，向左上偏移
    const textColor = isPassed ? '#999' : line.stationNameColor;

    let svg = `<g transform="rotate(-45, ${cx}, ${cy})">`;
    svg += `<text text-anchor="start" x="${cx + offset}" y="${cy - offset * 0.5}" font-size="${cnSize}" font-family="${FONT_FAMILY}" fill="${textColor}">${cnName}`;
    if (hasSec) {
        svg += `<tspan x="${cx + offset}" dy="${cnSize * 0.7 + gap}" font-size="${secSize}">${secName}</tspan>`;
    }
    svg += `</text></g>`;
    return svg;
}

/**
 * 垂直式（上方/下方） — 使用 CSS writing-mode 实现竖排文本
 * 中文在左列、英文在右列，字符自动从上到下排列
 * 上方模式使用 text-anchor: end 精确底部对齐站点上边缘
 */
function buildVerticalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, direction, isPassed) {
    const hasSec = !!secName;
    const colGap = cnSize * 0.4;
    const textColor = isPassed ? '#999' : line.stationNameColor;

    // 中文列 X 坐标（左），英文列 X 坐标（右）
    const cnX = hasSec ? cx - colGap : cx;
    const secX = cx + colGap;

    const isAbove = direction === 'above';
    // 上方：文本底端精确对齐站点上边缘；下方：文本顶端对齐站点下边缘
    const anchorY = isAbove
        ? cy - halfIcon - TEXT_PAD   // 文本结束于此（上方）
        : cy + halfIcon + TEXT_PAD;  // 文本开始于此（下方）
    const anchor = isAbove ? 'end' : 'start';

    let svg = '';

    // 中文列（左）
    // 水平居中：仅中文时 x=cx（列自动居中），双语时 x=cx-colGap
    // 垂直对齐：text-anchor 在 vertical-rl 中控制垂直方向，end=底部对齐  start=顶部对齐
    svg += `<text x="${cnX}" y="${anchorY}" style="writing-mode: vertical-rl; text-anchor: ${anchor}; letter-spacing: ${VERT_LETTER_SPACING};" font-size="${cnSize}" font-family="${FONT_FAMILY}" fill="${textColor}">${cnName}</text>`;

    // 英文列（右）
    if (hasSec) {
        svg += `<text x="${secX}" y="${anchorY}" style="writing-mode: vertical-rl; text-anchor: ${anchor}; letter-spacing: ${VERT_LETTER_SPACING};" font-size="${secSize}" font-family="${FONT_FAMILY}" fill="${textColor}">${secName}</text>`;
    }

    return svg;
}

/**
 * 为单个站点生成站名 SVG 片段
 * @param {Object} station - 车站数据
 * @param {number} cx - 站点在 viewBox 中的 X 坐标
 * @param {number} cy - 站点在 viewBox 中的 Y 坐标
 * @param {number} index - 站点索引（用于交错模式）
 * @param {boolean} isPassed - 是否为已过站（灰色字）
 * @returns {string} SVG 文本元素字符串
 */
function buildStationNameSvg(station, cx, cy, index, isPassed) {
    const cnName = (station.name || '').trim();
    const secName = (station.secondaryName || '').trim();
    if (!cnName && !secName) return '';

    const cnSize = line.nameFontSize;
    const secSize = cnSize / 2;
    const halfIcon = line.iconSize / 2;

    switch (line.nameDisplayMode) {
        case 'alternating':
            return buildAlternatingText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, index, isPassed);
        case 'diagonal':
            return buildDiagonalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, isPassed);
        case 'above':
            return buildVerticalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, 'above', isPassed);
        case 'below':
            return buildVerticalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, 'below', isPassed);
        default:
            return '';
    }
}

// ========== PIDS 横幅 ==========

/**
 * renderBanner - 生成 PIDS 顶部横幅 SVG
 *
 * 横幅包含线路色背景和白色装饰条带，白色区域内显示当前站/下一站信息。
 * 停站中显示「本站」，区间运行中显示「下一站」。
 * 标签与时间用黑色，站名用红色。
 *
 * 依赖: line (全局), stations (全局), FONT_FAMILY (全局),
 *       currentStationIndex, isDeparted (全局)
 */
function renderBanner() {
    if (!pidsBanner) return;

    const txtColor = line.bannerTextColor;
    const displayTime = getDisplayTime();
    const timeStr = formatTimeHM(displayTime);

    // 终点站（目的地）
    const destCnName = stations.length > 0
        ? stations[stations.length - 1].name
        : '';
    const destSecName = stations.length > 0
        ? (stations[stations.length - 1].secondaryName || '')
        : '';

    // 站信息
    let cnLabel = '', enLabel = '', nameCN = '', nameEN = '';
    let timeCN = '', timeEN = '';

    if (stations.length > 0 && currentStationIndex >= 0) {
        const nextIdx = (currentStationIndex + 1) % stations.length;
        const currentStation = stations[currentStationIndex];
        const nextStation = stations[nextIdx];
        const timeToNext = currentStation.timeToNext;

        cnLabel = isDeparted ? '下一站：' : '本站：';
        enLabel = isDeparted ? 'Next station：' : 'This station：';
        const displayStation = isDeparted ? nextStation : currentStation;
        nameCN = displayStation.name;
        nameEN = displayStation.secondaryName || displayStation.name;
        // 终点站停站时不显示到达时间（没有下一站）
        const isTerminal = (!isDeparted && currentStationIndex === stations.length - 1);
        timeCN = isTerminal ? '' : `下一站预计 ${timeToNext} 分钟`;
        timeEN = isTerminal ? '' : `arrive in ${timeToNext} min`;
    }

    const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 95" preserveAspectRatio="none">
  <rect width="1920" height="95" fill="${line.color}"/>
  <path fill="#fff" d="M1352.7,90h-785.5c-8.3,0-15-6.7-15-15V0h815.5v75c0,8.3-6.7,15-15,15Z"/>
  <text x="1890" y="60" fill="${txtColor}" font-size="44" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">${timeStr}</text>
  <text x="1480" y="45" fill="${txtColor}" fill-opacity="0.85" font-size="30" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">开往：</text>
  <text x="1600" y="45" fill="${txtColor}" fill-opacity="0.85" font-size="30" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${destCnName}</text>
  <text x="1475" y="65" fill="${txtColor}" fill-opacity="0.65" font-size="20" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">To：</text>
  <text x="1600" y="65" fill="${txtColor}" fill-opacity="0.65" font-size="15" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${destSecName}</text>
  <text x="570" y="42" fill="#000" font-size="24" font-family="${FONT_FAMILY}" font-weight="bold">${cnLabel}</text>
  <text x="960" y="42" fill="#e94560" font-size="32" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${nameCN}</text>
  <text x="1350" y="42" fill="#000" font-size="24" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">${timeCN}</text>
  <text x="570" y="72" fill="#000" fill-opacity="0.85" font-size="15" font-family="${FONT_FAMILY}">${enLabel}</text>
  <text x="960" y="72" fill="#e94560" fill-opacity="0.85" font-size="20" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${nameEN}</text>
  <text x="1350" y="72" fill="#000" fill-opacity="0.85" font-size="15" font-family="${FONT_FAMILY}" text-anchor="end">${timeEN}</text>
</svg>`;

    pidsBanner.innerHTML = bannerSvg;
}

/**
 * applyPidsBackground - 根据 pidsBackground 状态更新 .pids-display 背景
 *
 * 支持纯色和纹理图片两种模式，图片模式支持 cover/contain/tile 三种填充方式。
 *
 * 依赖: pidsBackground (全局), pidsDisplay (全局 DOM 引用)
 */
function applyPidsBackground() {
    if (!pidsDisplay || !pidsBgLayer) return;

    if (pidsBackground.type === 'color') {
        // 纯色模式：背景色设在 pidsDisplay 上，清空 bgLayer
        pidsDisplay.style.background = pidsBackground.color;
        pidsBgLayer.style.backgroundImage = '';
        pidsBgLayer.style.opacity = '';
    } else if (pidsBackground.type === 'image' && pidsBackground.image) {
        // 图片模式：图片+透明度在 bgLayer 上，pidsDisplay 保持底色
        pidsDisplay.style.background = pidsBackground.color;
        pidsBgLayer.style.backgroundImage = `url(${pidsBackground.image})`;
        pidsBgLayer.style.backgroundPosition = 'center';
        pidsBgLayer.style.opacity = pidsBackground.imageOpacity;
        switch (pidsBackground.imageSize) {
            case 'cover':
                pidsBgLayer.style.backgroundSize = 'cover';
                pidsBgLayer.style.backgroundRepeat = 'no-repeat';
                break;
            case 'contain':
                pidsBgLayer.style.backgroundSize = 'contain';
                pidsBgLayer.style.backgroundRepeat = 'no-repeat';
                break;
            case 'tile':
                pidsBgLayer.style.backgroundSize = 'auto';
                pidsBgLayer.style.backgroundRepeat = 'repeat';
                break;
        }
    }
    scheduleSave();
}

// ========== PIDS 显示 ==========

// ========== 换乘站 SVG 渲染 ==========

/**
 * buildTransferIcon - 生成换乘站图标的 SVG 片段
 *
 * 内联 transfer.svg 路径数据 (viewBox 0 0 40 40)，等比缩放至 iconSize。
 * 使用内联 path 而非外部 <image> 引用，避免加载失败导致图标隐形
 * 进而造成换乘框与图标不同步闪烁的视觉 bug。
 *
 * @param  {number} cx   - 图标中心 X
 * @param  {number} cy   - 图标中心 Y
 * @param  {number} size - 图标尺寸
 * @returns {string} SVG g 元素字符串（含 3 个 path）
 */
function buildTransferIcon(cx, cy, size) {
    // 内联 transfer.svg 路径 (viewBox="0 0 40 40")，等比缩放至 iconSize
    // 避免外部 <image> 加载失败导致图标隐形、与换乘框不同步
    const s = size / 40;
    const x = cx - size / 2;
    const y = cy - size / 2;
    return `<g transform="translate(${x}, ${y}) scale(${s})">
    <path fill="#231815" d="M20,0c11.05,0,20,8.95,20,20,0,10.92-8.76,19.8-19.63,20h-.37c-2.76,0-5.38-.55-7.77-1.56C5.04,35.4,0,28.29,0,20,0,9.08,8.76.2,19.63,0h.37Z"/>
    <path fill="#fff" d="M20,4.44c-8.56,0-15.56,7-15.56,15.56,0,8.56,7,15.56,15.56,15.56,8.56,0,15.56-7,15.56-15.56,0-8.56-7-15.56-15.56-15.56Z"/>
    <path fill="#231815" d="M23.34,12.81l.06-3.63s0-.19.37-.27c.22-.03.44.03.61.16l6.26,4.65c.34.19.55.53.57.91,0,.33-.16.64-.43.82l-6.45,4.31c-.24.08-.5.1-.75.06-.37-.08-.37-.36-.37-.36l.07-3.39-6.19-.1s-4.9.58-4.93,2.42c0,0,.18-5.75,5.14-5.67M16.76,27.32l-.06,3.63s-.07.22-.47.27c-.18.02-.35-.03-.49-.15l-6.26-4.65c-.34-.19-.56-.53-.58-.92,0-.33.16-.64.44-.83l6.44-4.31c.19-.1.42-.12.63-.06.45.13.46.36.46.36l-.06,3.4,6.23.11s4.9-.58,4.93-2.42c0,0-.18,5.77-5.14,5.67"/>
  </g>`;
}

/**
 * buildTransferIconGray - 生成已过站换乘图标的灰色 SVG 片段
 *
 * 与 buildTransferIcon 相同的路径结构，但使用灰色调代替原始颜色。
 * 已过站的换乘图标常亮（不参与闪烁），用灰色表示已过状态。
 *
 * @param  {number} cx   - 图标中心 X
 * @param  {number} cy   - 图标中心 Y
 * @param  {number} size - 图标尺寸
 * @returns {string} SVG g 元素字符串
 */
function buildTransferIconGray(cx, cy, size) {
    const s = size / 40;
    const x = cx - size / 2;
    const y = cy - size / 2;
    return `<g transform="translate(${x}, ${y}) scale(${s})">
    <path fill="#999" d="M20,0c11.05,0,20,8.95,20,20,0,10.92-8.76,19.8-19.63,20h-.37c-2.76,0-5.38-.55-7.77-1.56C5.04,35.4,0,28.29,0,20,0,9.08,8.76.2,19.63,0h.37Z"/>
    <path fill="#ddd" d="M20,4.44c-8.56,0-15.56,7-15.56,15.56,0,8.56,7,15.56,15.56,15.56,8.56,0,15.56-7,15.56-15.56,0-8.56-7-15.56-15.56-15.56Z"/>
    <path fill="#999" d="M23.34,12.81l.06-3.63s0-.19.37-.27c.22-.03.44.03.61.16l6.26,4.65c.34.19.55.53.57.91,0,.33-.16.64-.43.82l-6.45,4.31c-.24.08-.5.1-.75.06-.37-.08-.37-.36-.37-.36l.07-3.39-6.19-.1s-4.9.58-4.93,2.42c0,0,.18-5.75,5.14-5.67M16.76,27.32l-.06,3.63s-.07.22-.47.27c-.18.02-.35-.03-.49-.15l-6.26-4.65c-.34-.19-.56-.53-.58-.92,0-.33.16-.64.44-.83l6.44-4.31c.19-.1.42-.12.63-.06.45.13.46.36.46.36l-.06,3.4,6.23.11s4.9-.58,4.93-2.42c0,0-.18,5.77-5.14,5.67"/>
  </g>`;
}

/**
 * estimateTransferFrameSize - 估算换乘线路框的 SVG 尺寸
 *
 * 根据文字内容、字号、行数估算框宽和框高。
 * CN 每字符宽度 ≈ 字号，EN 每字符宽度 ≈ 字号 × 0.6。
 *
 * @param  {Object} lineData - {color, nameCN, nameEN, textMode, cnFontSize, enFontSize}
 * @returns {Object} { w, h, cnLines, enLines, cnFS, enFS }
 */
function estimateTransferFrameSize(lineData) {
    const cnLines = (lineData.nameCN || '').replace(/\\n/g, '\n').split('\n');
    const enLines = (lineData.nameEN || '').replace(/\\n/g, '\n').split('\n');
    const cnFS = lineData.cnFontSize || 3.0;
    const enFS = lineData.enFontSize || 2.0;
    const padX = 1;  // 左右各 0.5px
    const padY = 0.5;  // 上 0.5px、下 0px

    // 宽度：取所有行中最长的一行
    let maxW = 10;
    cnLines.forEach(l => {
        const w = l.length * cnFS + padX;
        if (w > maxW) maxW = w;
    });
    enLines.forEach(l => {
        const w = l.length * enFS * 0.6 + padX;
        if (w > maxW) maxW = w;
    });

    // 高度：CN 行高 + EN 行高 + 段间距 + 内边距
    const lnGap = 1.0;  // 行高系数（行高 ≈ fontSize × lnGap）
    const cnH = cnLines.length > 0 ? cnLines.length * cnFS * lnGap : 0;
    const enH = enLines.length > 0 ? enLines.length * enFS * lnGap : 0;
    const segGap = (cnLines.length > 0 && enLines.length > 0) ? 0.5 : 0;
    const h = cnH + segGap + enH + padY;

    return { w: maxW, h: Math.max(6, h), cnLines, enLines, cnFS, enFS };
}

/**
 * buildTransferLineFrame - 生成单条换乘线路名称框的 SVG 片段
 *
 * 框尺寸根据文字内容自适应。支持 \n 换行，CN/EN 各自多行渲染。
 *
 * @param  {Object} lineData - {color, nameCN, nameEN, textMode, cnFontSize, enFontSize}
 * @param  {number} x        - 框左上角 X
 * @param  {number} y        - 框左上角 Y
 * @param  {number} frameW   - 框宽度
 * @param  {number} frameH   - 框高度
 * @param  {boolean} isPassed - 是否为已过站（灰色配色）
 * @returns {string} SVG g 元素字符串
 */
function buildTransferLineFrame(lineData, x, y, frameW, frameH, isPassed) {
    const rx = frameW * (5.4 / 62);
    const fillColor = isPassed ? '#ccc' : lineData.color;
    const textColor = isPassed ? '#999' : (lineData.textMode === 'light' ? '#ffffff' : '#000000');
    const cnFS = lineData.cnFontSize || 3.0;
    const enFS = lineData.enFontSize || 2.0;
    const lnGap = 1.0;

    const cnLines = (lineData.nameCN || '').replace(/\\n/g, '\n').split('\n');
    const enLines = (lineData.nameEN || '').replace(/\\n/g, '\n').split('\n');

    // CN 文字块总高
    const cnBlockH = cnLines.length > 0 ? cnLines.length * cnFS * lnGap : 0;
    const enBlockH = enLines.length > 0 ? enLines.length * enFS * lnGap : 0;
    const segGap = (cnLines.length > 0 && enLines.length > 0) ? 0.5 : 0;
    const blockH = cnBlockH + segGap + enBlockH;

    // CN 块起始 Y（顶部对齐，上留白 = frameH - blockH）
    const topPad = frameH - blockH;
    const cnStartY = y + topPad;
    // EN 块起始 Y
    const enStartY = cnStartY + cnBlockH + segGap;

    let svg = `<g>
    <rect x="${x}" y="${y}" width="${frameW}" height="${frameH}" rx="${rx}" ry="${rx}"
          fill="${fillColor}"/>`;

    // CN 多行
    if (cnLines.length > 0) {
        svg += `
    <text x="${x + frameW / 2}" y="${cnStartY}" text-anchor="middle" dominant-baseline="hanging"
          font-size="${cnFS}" font-family="${FONT_FAMILY}" fill="${textColor}">`;
        for (let li = 0; li < cnLines.length; li++) {
            const dy = li === 0 ? 0 : (cnFS * lnGap);
            const lineText = cnLines[li].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            svg += `
      <tspan x="${x + frameW / 2}" dy="${dy}">${lineText}</tspan>`;
        }
        svg += `
    </text>`;
    }

    // EN 多行
    if (enLines.length > 0) {
        svg += `
    <text x="${x + frameW / 2}" y="${enStartY}" text-anchor="middle" dominant-baseline="hanging"
          font-size="${enFS}" font-family="${FONT_FAMILY}" fill="${textColor}">`;
        for (let li = 0; li < enLines.length; li++) {
            const dy = li === 0 ? 0 : (enFS * lnGap);
            const lineText = enLines[li].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            svg += `
      <tspan x="${x + frameW / 2}" dy="${dy}">${lineText}</tspan>`;
        }
        svg += `
    </text>`;
    }

    svg += `
  </g>`;
    return svg;
}

/**
 * buildTransferFrames - 根据站名排布模式生成换乘线路框组的 SVG 片段
 *
 * 四个模式对应不同的换乘框位置：
 *   - alternating: 在站名文字块一侧
 *   - diagonal / above: 在站点圆圈下方
 *   - below: 在站点圆圈上方
 *
 * @param  {Object} station   - 车站对象（含 transferLines）
 * @param  {number} cx        - 站点圆圈中心 X
 * @param  {number} cy        - 站点圆圈中心 Y
 * @param  {number} nameIndex - 站名逻辑索引（用于 alternating 奇偶判断）
 * @param  {boolean} isPassed - 是否为已过站（灰色配色）
 * @returns {string} SVG 片段字符串
 */
function buildTransferFrames(station, cx, cy, nameIndex, isPassed) {
    const lines = station.transferLines;
    if (!lines || lines.length === 0) return '';

    const viewBoxWidth = 300;
    const frameGap = 1;
    const halfIcon = line.iconSize / 2;
    const count = lines.length;

    // 预计算每条线路的框尺寸
    const sizes = lines.map(ld => estimateTransferFrameSize(ld));
    const frameW = Math.max(...sizes.map(s => s.w));  // 统一宽度 = 最宽框
    const frameHs = sizes.map(s => s.h);               // 各框各自高度

    // 网格布局：每行最多 2 列，末行不足 2 个时居中
    const COLS = Math.min(count, 2);
    const ROWS = Math.ceil(count / 2);

    // 每行高度 = 该行最高框
    const rowHeights = [];
    for (let r = 0; r < ROWS; r++) {
        let maxH = 0;
        for (let c = 0; c < COLS; c++) {
            const i = r * COLS + c;
            if (i < count) maxH = Math.max(maxH, frameHs[i]);
        }
        rowHeights.push(maxH);
    }
    const totalH = rowHeights.reduce((sum, h) => sum + h, 0) + (ROWS - 1) * frameGap;
    const totalW = COLS * frameW + (COLS - 1) * frameGap;

    let tfX, tfY, availTop, availBottom, scaleFromBottom;
    const MARGIN = 0.5;

    switch (line.nameDisplayMode) {
        case 'alternating': {
            const cnName = (station.name || '').trim();
            const secName = (station.secondaryName || '').trim();
            const cnSize = line.nameFontSize;
            const secSize = cnSize / 2;

            // 奇数站(站1/3/5)文字在上方 → 框在文字上方
            // 偶数站(站2/4/6)文字在下方 → 框在文字下方
            const isAbove = nameIndex % 2 === 0;
            const hasSec = !!secName;
            const gap = hasSec ? Math.max(1, secSize * 0.3) : 0;
            const totalTextHeight = hasSec ? (cnSize + gap + secSize) : cnSize;

            // 水平：居中对齐站点圆圈
            tfX = cx - totalW / 2;
            if (isAbove) {
                // 框在站名文字上方 → 缩放原点为底边中点（靠近站名侧）
                const textBottom = cy - halfIcon - TEXT_PAD;
                const textTop = textBottom - totalTextHeight;
                availTop = MARGIN;
                availBottom = textTop - frameGap;
                tfY = availBottom - totalH;
                scaleFromBottom = true;
            } else {
                // 框在站名文字下方 → 缩放原点为顶边中点（靠近站名侧）
                const textTop = cy + halfIcon + TEXT_PAD;
                const textBottom = textTop + totalTextHeight;
                availTop = textBottom + frameGap;
                availBottom = VIEWBOX_HEIGHT - MARGIN;
                tfY = availTop;
                scaleFromBottom = false;
            }
            break;
        }
        case 'diagonal':
        case 'above':
            // 在站点圆圈下方 → 缩放原点为顶边中点（靠近圆圈侧）
            tfX = cx - totalW / 2;
            availTop = cy + halfIcon + TEXT_PAD;
            availBottom = VIEWBOX_HEIGHT - MARGIN;
            tfY = availTop;
            scaleFromBottom = false;
            break;
        case 'below':
            // 在站点圆圈上方 → 缩放原点为底边中点（靠近圆圈侧）
            tfX = cx - totalW / 2;
            availTop = MARGIN;
            availBottom = cy - halfIcon - TEXT_PAD;
            tfY = availBottom - totalH;
            scaleFromBottom = true;
            break;
        default:
            return '';
    }

    // 水平钳位
    tfX = Math.max(0, Math.min(viewBoxWidth - totalW, tfX));

    // 溢出检测：以可用空间为基准，超出时等比缩小
    const availSpaceH = availBottom - availTop;
    const scaleW = totalW > viewBoxWidth - MARGIN * 2 ? (viewBoxWidth - MARGIN * 2) / totalW : 1;
    const scaleH = totalH > availSpaceH ? availSpaceH / totalH : 1;
    const scale = Math.min(scaleW, scaleH);

    // 缩放后以靠站名侧底边为基准重新定位
    const scaledH = totalH * scale;
    // tfY 保持原位，SVG transform 以靠站名边为原点处理缩放
    // 仅钳位：确保缩放后的视觉范围在可用空间内
    if (scaleFromBottom) {
        const visualTop = tfY + totalH - scaledH;
        if (visualTop < availTop) { tfY += availTop - visualTop; }
    } else {
        const visualBottom = tfY + scaledH;
        if (visualBottom > availBottom) { tfY -= visualBottom - availBottom; }
    }

    // 缩放原点 = 靠近站名那侧的底边中点
    const groupCX = tfX + totalW / 2;
    const groupCY = scaleFromBottom ? (tfY + totalH) : tfY;

    let svg = '';
    let needsWrapper = scale < 1;
    if (needsWrapper) {
        svg += `\n  <g transform="translate(${groupCX}, ${groupCY}) scale(${scale}) translate(${-groupCX}, ${-groupCY})">`;
    }

    // 逐行逐列生成，各框使用各自的 frameH
    let fy = tfY;
    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
        const framesInRow = Math.min(count - idx, COLS);
        const rowW = framesInRow * frameW + (framesInRow - 1) * frameGap;
        const rowOffsetX = (totalW - rowW) / 2;  // 行内居中

        for (let c = 0; c < framesInRow; c++) {
            const fx = tfX + rowOffsetX + c * (frameW + frameGap);
            const fh = frameHs[idx];
            svg += '\n  ' + buildTransferLineFrame(lines[idx], fx, fy, frameW, fh, isPassed);
            idx++;
        }
        fy += rowHeights[r] + frameGap;
    }

    if (needsWrapper) {
        svg += '\n  </g>';
    }

    return svg;
}

/**
 * buildArrowSvg - 生成站间方向箭头的 SVG 片段
 *
 * 内联 arrow SVG 的 polyline 路径数据（viewBox ≈ 23×23），等比缩放。
 * 3 个 chevron polyline 在不同帧依次可见，形成"生长"动画效果。
 *
 * @param  {number}  cx       - 箭头中心 X（两站中点）
 * @param  {number}  cy       - 箭头中心 Y
 * @param  {number}  w        - 箭头宽度
 * @param  {number}  h        - 箭头高度
 * @param  {string}  direction - 运行方向 'left' | 'right'
 * @param  {number}  frame    - 动画帧 0/1/2
 * @param  {boolean} isPassed - 是否为已过段（灰色箭头）
 * @returns {string} SVG g 元素字符串
 */
function buildArrowSvg(cx, cy, w, h, direction, frame, isPassed) {
    const VB_W = 50, VB_H = 23;
    const sx = w / VB_W;
    const sy = h / VB_H;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const arrowStroke = isPassed ? '#999' : line.arrowColor;

    // 左行箭头 chevron（指向左 ←），按从右到左排列，间距 12 单位
    const LEFT_PATHS = [
        "24,0.56 18,11.51 24,22.76",    // [0] 右 chevron（tip=18, sides=24）
        "18,0.56 12,11.51 18,22.76",    // [1] 中 chevron（tip=12, sides=18）
        "12,0.56 6,11.51 12,22.76"      // [2] 左 chevron（tip=6, sides=12）
    ];
    // 右行箭头 chevron（指向右 →），按从左到右排列，间距 12 单位
    const RIGHT_PATHS = [
        "4,0.56 10,11.51 4,22.76",      // [0] 左 chevron（tip=10, sides=4）
        "22,0.56 28,11.51 22,22.76",    // [1] 中 chevron（tip=28, sides=22）
        "40,0.56 46,11.51 40,22.76"     // [2] 右 chevron（tip=46, sides=40）
    ];

    // 左行 → 使用左指路径；右行 → 使用右指路径
    const paths = direction === 'left' ? LEFT_PATHS : RIGHT_PATHS;

    // 路径已按生长方向排列，统一从 index 0 开始生长
    const FRAME_VISIBLE = [[0], [0, 1], [0, 1, 2]];

    const visible = new Set(FRAME_VISIBLE[frame]);

    let svg = `<g transform="translate(${x}, ${y}) scale(${sx}, ${sy})">`;
    for (let pi = 0; pi < 3; pi++) {
        const strokeAttr = visible.has(pi)
            ? `stroke="${arrowStroke}" stroke-width="${line.arrowStrokeWidth}" stroke-miterlimit="10"`
            : '';
        svg += `\n  <polyline fill="none" ${strokeAttr} points="${paths[pi]}"/>`;
    }
    svg += `\n</g>`;
    return svg;
}

/**
 * isStationPassed - 判断逻辑站索引是否对应"已过站"
 *
 * 列车始终从索引 0 出发向 N-1 行进，已过站 = 逻辑索引小于当前站。
 * 该逻辑与运行方向无关——方向只影响视觉排列。
 *
 * @param  {number}  logicalIndex - 逻辑站索引
 * @returns {boolean} true 表示该站已过
 */
function isStationPassed(logicalIndex) {
    if (currentStationIndex < 0) return false;
    // 离站状态：当前站也已过（列车在区间运行中）
    if (isDeparted && logicalIndex === currentStationIndex) return true;
    // 列车始终从 0 站出发向 N-1 行进，已过站 = 索引小于当前站
    return logicalIndex < currentStationIndex;
}

function renderPIDSDisplay() {
    const viewBoxWidth = 300;
    const rectX = (viewBoxWidth - line.length) / 2;
    const lineCenterY = getLineY() + line.strokeWidth / 2;

    // 站点图标在 viewBox 中的尺寸（由控制面板全局设置）
    const iconSize = line.iconSize;
    const strokeW = Math.max(0.5, iconSize / 10);

    // 构建站点图标 + 站名 SVG
    let stationsSvg = '';
    let currentCx = null;  // 当前站 X 坐标（用于线路分段）
    if (stations.length > 0) {
        // 确定视觉首末站（左行←：站N-1在最左；右行→：站0在最左）
        const visualFirstIdx = line.direction === 'left' ? stations.length - 1 : 0;
        const visualLastIdx = line.direction === 'left' ? 0 : stations.length - 1;

        // 起终点放在线路端头
        let firstCx = rectX;
        let lastCx = rectX + line.length;

        // 边界检测：针对视觉首末站
        const firstExtent = estimateStationExtent(stations[visualFirstIdx], visualFirstIdx);
        const lastExtent = estimateStationExtent(stations[visualLastIdx], visualLastIdx);
        const leftMin = firstExtent.left;
        const rightMax = viewBoxWidth - lastExtent.right;

        if (firstCx < leftMin) firstCx = leftMin;
        if (lastCx > rightMax) lastCx = rightMax;

        const spacing = stations.length > 1
            ? (lastCx - firstCx) / (stations.length - 1)
            : 0;

        const stationCxs = [];  // 收集各站 X 坐标（视觉序 vi），用于箭头定位
        const N = stations.length;

        // ═══════════════════════════════════════════════
        // 第一轮：预计算各站位置
        // ═══════════════════════════════════════════════
        // stationRenderData[vi] = { vi, i, station, cx, isPassed, isCurrent, arrivalTime, showTime }
        const stationRenderData = [];

        for (let vi = 0; vi < N; vi++) {
            const i = line.direction === 'left'
                ? (N - 1 - vi)
                : vi;
            const station = stations[i];
            const cx = N > 1
                ? firstCx + spacing * vi
                : rectX + line.length / 2;
            stationCxs.push(cx);
            stationRenderData[vi] = {
                vi, i, station, cx,
                isPassed: isStationPassed(i),
                isCurrent: (i === currentStationIndex),
                arrivalTime: 0,
                showTime: false
            };
        }

        // ═══════════════════════════════════════════════
        // 第二轮：沿列车行进方向计算到站时间
        // ═══════════════════════════════════════════════
        // 右行→：视觉序 0→N-1（从左到右 = 行进方向）
        // 左行←：视觉序 N-1→0（从右到左 = 行进方向）
        {
            const iterOrder = (line.direction === 'right')
                ? Array.from({ length: N }, (_, vi) => vi)       // 左→右
                : Array.from({ length: N }, (_, vi) => N - 1 - vi); // 右→左

            let cumulative = 0;
            let foundCurrent = (currentStationIndex < 0);  // 无当前站时从第一个站开始
            let isFirst = true;

            for (const vi of iterOrder) {
                const d = stationRenderData[vi];
                if (d.isCurrent) {
                    foundCurrent = true;
                    d.arrivalTime = 0;
                    d.showTime = true;
                    cumulative = d.station.timeToNext || 0;
                } else if (!d.isPassed) {
                    if (foundCurrent) {
                        d.arrivalTime = cumulative;
                        d.showTime = true;
                        cumulative += d.station.timeToNext || 0;
                    } else if (isFirst && currentStationIndex < 0) {
                        // 无当前站：所有站显示时间，第一个站为 0
                        d.arrivalTime = 0;
                        d.showTime = true;
                        isFirst = false;
                        cumulative = d.station.timeToNext || 0;
                    }
                }
            }
        }

        // 更新 currentCx（用于线路分段）
        if (currentStationIndex >= 0) {
            for (const d of stationRenderData) {
                if (d.isCurrent) { currentCx = d.cx; break; }
            }
        }

        // ═══════════════════════════════════════════════
        // 第三轮：按视觉序（左→右）渲染各站 SVG
        // ═══════════════════════════════════════════════
        for (let vi = 0; vi < N; vi++) {
            const d = stationRenderData[vi];
            const { i, station, cx, isPassed, isCurrent, arrivalTime, showTime } = d;

            const x = cx - iconSize / 2 + strokeW / 2;
            const y = lineCenterY - iconSize / 2 + strokeW / 2;
            const renderSize = iconSize - strokeW;

            // 站点圆圈样式
            const stationStroke = isPassed ? '#999' : line.color;
            const stationFill = isPassed
                ? '#f0f0f0'
                : (isCurrent
                    ? (currentStationBlink ? '#FFD700' : '#fff')
                    : '#fff');
            const stationGlow = (isCurrent && !isPassed)
                ? ` filter="url(#glow)"`
                : '';

            // 判断是否为换乘站
            const isTransferStation = station.type === '换乘站'
                && station.transferLines && station.transferLines.length > 0;
            const showTransfer = isTransferStation && transferToggle && !isPassed;
            const showPassedTransfer = isTransferStation && isPassed;

            if (showTransfer) {
                // 换乘样式：transfer.svg 图标，不显示时间
                stationsSvg += '\n  ' + buildTransferIcon(cx, lineCenterY, iconSize);
            } else if (showPassedTransfer) {
                // 已过站换乘图标：灰色版，常亮
                stationsSvg += '\n  ' + buildTransferIconGray(cx, lineCenterY, iconSize);
            } else {
                // 普通样式：圆圈
                stationsSvg += `
  <rect x="${x}" y="${y}" width="${renderSize}" height="${renderSize}" rx="${renderSize / 2}" ry="${renderSize / 2}" fill="${stationFill}" stroke="${stationStroke}" stroke-width="${strokeW}"${stationGlow} />`;

                // 到站时间（仅未过站且非换乘态且非当前站显示，当前站时间为0无意义）
                if (showTime && !isCurrent) {
                    const timeFontSize = Math.max(1.2, iconSize * 0.5);
                    const timeFill = isCurrent ? '#fff' : '#000';
                    stationsSvg += `
  <text x="${cx}" y="${lineCenterY}" text-anchor="middle" dominant-baseline="central" font-size="${timeFontSize}" font-family="${FONT_FAMILY}" fill="${timeFill}">${arrivalTime}</text>`;
                }
            }

            // 站名文字（已过站用灰色）
            const nameSvg = buildStationNameSvg(station, cx, lineCenterY, i, isPassed);
            if (nameSvg) {
                stationsSvg += '\n  ' + nameSvg;
            }

            // 换乘线路框（常亮，已过站灰色）
            if (isTransferStation) {
                const framesSvg = buildTransferFrames(station, cx, lineCenterY, i, isPassed);
                if (framesSvg) {
                    stationsSvg += '\n  ' + framesSvg;
                }
            }
        }

        // 站间箭头（每两个相邻站之间一个箭头）
        if (stations.length > 1) {
            for (let si = 0; si < stations.length - 1; si++) {
                const cx1 = stationCxs[si];
                const cx2 = stationCxs[si + 1];
                const arrowW = line.strokeWidth * line.arrowScaleW;
                const arrowH = line.strokeWidth * line.arrowScaleH;

                // 箭头位置：两站居中
                const arrowCx = (cx1 + cx2) / 2;

                // 判断是否为当前运行区间
                let isActive = false;
                if (currentStationIndex >= 0) {
                    if (line.direction === 'right') {
                        isActive = (si === currentStationIndex);
                    } else {
                        isActive = (si === stations.length - 2 - currentStationIndex);
                    }
                }

                // 判断该段是否已过（段左端站已过 = 段已过）
                const leftVisualIdx = si;
                const leftLogicalIdx = line.direction === 'left'
                    ? stations.length - 1 - leftVisualIdx
                    : leftVisualIdx;
                const segPassed = isStationPassed(leftLogicalIdx);
                // 站间运行时当前活跃区间的箭头保持活跃色，不灰化
                const actualPassed = (isDeparted && isActive) ? false : segPassed;

                const frame = isActive ? arrowFrame : 2;
                stationsSvg += '\n  ' + buildArrowSvg(arrowCx, lineCenterY, arrowW, arrowH, line.direction, frame, actualPassed);
            }
        }
    }

    // 线路分段：已过段灰色 + 未过段彩色
    let lineSvg = '';
    if (currentStationIndex >= 0 && currentCx !== null) {
        // 已过段 = 列车已经过的区间（左行←时在当前站右侧，右行→时在当前站左侧）
        const isLeftDir = (line.direction === 'left');
        const passedStart = isLeftDir ? currentCx : rectX;
        const passedEnd   = isLeftDir ? (rectX + line.length) : currentCx;
        const upcomingStart = isLeftDir ? rectX : currentCx;
        const upcomingEnd   = isLeftDir ? currentCx : (rectX + line.length);

        // 已过段（灰色）
        if (passedEnd > passedStart) {
            lineSvg += `<rect x="${passedStart}" y="${getLineY()}" width="${passedEnd - passedStart}" height="${line.strokeWidth}" fill="#999" rx="0"/>`;
        }
        // 未过段（线路色）
        if (upcomingEnd > upcomingStart) {
            lineSvg += `\n  <rect x="${upcomingStart}" y="${getLineY()}" width="${upcomingEnd - upcomingStart}" height="${line.strokeWidth}" fill="${line.color}" rx="0"/>`;
        }
    } else {
        // 无当前站 → 全彩色
        lineSvg = `<rect x="${rectX}" y="${getLineY()}" width="${line.length}" height="${line.strokeWidth}" fill="${line.color}" rx="2"/>`;
    }

    const pidsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}" preserveAspectRatio="none" style="width:100%;height:100%;">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  ${lineSvg}
  ${stationsSvg}
</svg>`;

    pidsLineTrack.innerHTML = pidsSvg;
    renderBanner();
    scheduleSave();
}

// ========== 车站管理 ==========

function createStationData() {
    return {
        id: stationCounter++,
        name: `车站 ${stationCounter}`,
        secondaryName: `Station ${stationCounter}`,
        type: '普通站',
        timeToNext: 2,  // 到下一站所需时间（分钟）
        transferLines: []  // 换乘线路列表 [{color, nameCN, nameEN, textMode}]
    };
}

function createStationItem(station) {
    const item = document.createElement('div');
    item.className = 'station-item';
    item.id = `station-${station.id}`;
    item.draggable = true;

    item.innerHTML = `
        <span class="station-index">${stations.indexOf(station) + 1}</span>
        <div class="station-names">
            <input type="text" class="station-name" value="${station.name}" data-station-id="${station.id}" placeholder="中文站名">
            <input type="text" class="station-secondary-name" value="${station.secondaryName || ''}" data-station-id="${station.id}" placeholder="英文">
        </div>
        <div class="station-time-row">
            <input type="number" class="station-time" value="${station.timeToNext || 2}" data-station-id="${station.id}" min="0" max="99" step="1">
            <span>分</span>
        </div>
        <span class="station-type" data-station-id="${station.id}">${station.type}</span>
        <button class="station-move-up" data-station-id="${station.id}" title="上移">▲</button>
        <button class="station-move-down" data-station-id="${station.id}" title="下移">▼</button>
        <button class="station-delete" data-station-id="${station.id}">删除</button>
    `;

    // 中文名变更
    const nameInput = item.querySelector('.station-name');
    nameInput.addEventListener('change', (e) => {
        station.name = e.target.value;
        renderPIDSDisplay();
        scheduleSave();
    });

    // secondary 名变更
    const secNameInput = item.querySelector('.station-secondary-name');
    secNameInput.addEventListener('change', (e) => {
        station.secondaryName = e.target.value;
        renderPIDSDisplay();
        scheduleSave();
    });

    // 到下一站时间变更
    const timeInput = item.querySelector('.station-time');
    timeInput.addEventListener('change', (e) => {
        station.timeToNext = parseInt(e.target.value, 10) || 0;
        renderPIDSDisplay();
        scheduleSave();
    });

    // 站点类型显示（自动判定：有换乘线路 → 换乘站）
    const typeSpan = item.querySelector('.station-type');
    typeSpan.textContent = station.type;
    typeSpan.style.cursor = 'default';

    // 添加换乘按钮
    const addTransferBtn = document.createElement('button');
    addTransferBtn.className = 'station-add-transfer';
    addTransferBtn.textContent = '➕换乘';
    addTransferBtn.title = '添加换乘线路';
    addTransferBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addTransferLine(station);
    });
    // 插入到 typeSpan 之后
    typeSpan.insertAdjacentElement('afterend', addTransferBtn);

    // 上移
    const upBtn = item.querySelector('.station-move-up');
    upBtn.addEventListener('click', () => {
        moveStation(station.id, 'up');
    });

    // 下移
    const downBtn = item.querySelector('.station-move-down');
    downBtn.addEventListener('click', () => {
        moveStation(station.id, 'down');
    });

    // ---- 拖动排序 ----
    item.addEventListener('dragstart', (e) => {
        dragStationId = station.id;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(station.id));
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('.station-item').forEach(el => el.classList.remove('drag-over'));
        dragStationId = null;
    });

    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragStationId === station.id) return;
        item.classList.add('drag-over');
    });

    item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('drag-over');
        if (dragStationId == null || dragStationId === station.id) return;

        const fromIdx = stations.findIndex(s => s.id === dragStationId);
        const toIdx = stations.findIndex(s => s.id === station.id);
        if (fromIdx === -1 || toIdx === -1) return;

        // 移动元素
        const [moved] = stations.splice(fromIdx, 1);
        stations.splice(toIdx, 0, moved);

        // 如果拖拽的是当前高亮站，更新索引
        if (currentStationIndex === fromIdx) {
            currentStationIndex = toIdx;
        } else if (fromIdx < currentStationIndex && toIdx >= currentStationIndex) {
            currentStationIndex--;
        } else if (fromIdx > currentStationIndex && toIdx <= currentStationIndex) {
            currentStationIndex++;
        }

        dragStationId = null;
        rebuildStationList();
        renderPIDSDisplay();
        scheduleSave();
    });

    // 删除
    const deleteBtn = item.querySelector('.station-delete');
    deleteBtn.addEventListener('click', () => {
        deleteStation(station.id);
    });

    // 初始换乘面板
    updateTransferPanel(item, station);

    return item;
}

// ========== 换乘线路 UI 管理 ==========

/**
 * createTransferLineRow - 创建单条换乘线路编辑行 DOM
 *
 * @param {Object} station  - 所属车站对象
 * @param {Object} lineData - 换乘线路数据 {color, nameCN, nameEN, textMode}
 * @param {number} index    - 线路在 transferLines 数组中的索引
 * @returns {HTMLElement} 换乘线路行 DOM 元素
 */
function createTransferLineRow(station, lineData, index) {
    const row = document.createElement('div');
    row.className = 'transfer-line-row';

    // 颜色选择器
    const colorWrapper = document.createElement('div');
    colorWrapper.className = 'transfer-line-color';
    colorWrapper.style.backgroundColor = lineData.color;
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = lineData.color;
    colorInput.addEventListener('input', (e) => {
        lineData.color = e.target.value;
        colorWrapper.style.backgroundColor = lineData.color;
        renderPIDSDisplay();
        scheduleSave();
    });
    colorWrapper.appendChild(colorInput);

    // 中文字号
    const cnFsInput = document.createElement('input');
    cnFsInput.type = 'number';
    cnFsInput.className = 'transfer-line-font-size';
    cnFsInput.value = lineData.cnFontSize || 3.0;
    cnFsInput.step = '0.1';
    cnFsInput.min = '0.8';
    cnFsInput.max = '8';
    cnFsInput.title = 'CN 字号';
    cnFsInput.addEventListener('change', () => {
        lineData.cnFontSize = parseFloat(cnFsInput.value) || 3.0;
        renderPIDSDisplay();
        scheduleSave();
    });

    // 中文字号
    const enFsInput = document.createElement('input');
    enFsInput.type = 'number';
    enFsInput.className = 'transfer-line-font-size';
    enFsInput.value = lineData.enFontSize || 2.0;
    enFsInput.step = '0.1';
    enFsInput.min = '0.8';
    enFsInput.max = '6';
    enFsInput.title = 'EN 字号';
    enFsInput.addEventListener('change', () => {
        lineData.enFontSize = parseFloat(enFsInput.value) || 2.0;
        renderPIDSDisplay();
        scheduleSave();
    });

    // 中文名输入
    const cnInput = document.createElement('input');
    cnInput.type = 'text';
    cnInput.className = 'transfer-line-name-input';
    cnInput.value = lineData.nameCN;
    cnInput.placeholder = '中文名(\\n换行)';
    cnInput.addEventListener('change', () => {
        lineData.nameCN = cnInput.value;
        renderPIDSDisplay();
        scheduleSave();
    });

    // 英文名输入
    const enInput = document.createElement('input');
    enInput.type = 'text';
    enInput.className = 'transfer-line-name-input';
    enInput.value = lineData.nameEN;
    enInput.placeholder = 'English(\\n wrap)';
    enInput.addEventListener('change', () => {
        lineData.nameEN = enInput.value;
        renderPIDSDisplay();
        scheduleSave();
    });

    // 文字亮/暗色选择
    const modeSelect = document.createElement('select');
    modeSelect.className = 'transfer-line-text-mode';
    const lightOpt = document.createElement('option');
    lightOpt.value = 'light';
    lightOpt.textContent = '浅色';
    const darkOpt = document.createElement('option');
    darkOpt.value = 'dark';
    darkOpt.textContent = '深色';
    modeSelect.appendChild(lightOpt);
    modeSelect.appendChild(darkOpt);
    modeSelect.value = lineData.textMode;
    modeSelect.addEventListener('change', () => {
        lineData.textMode = modeSelect.value;
        renderPIDSDisplay();
        scheduleSave();
    });

    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'transfer-line-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
        removeTransferLine(station, index);
    });

    row.appendChild(colorWrapper);
    row.appendChild(cnFsInput);
    row.appendChild(enFsInput);
    row.appendChild(cnInput);
    row.appendChild(enInput);
    row.appendChild(modeSelect);
    row.appendChild(deleteBtn);

    return row;
}

/**
 * addTransferLine - 向车站添加一条默认换乘线路（最多 4 条）
 *
 * 自动将车站类型设为「换乘站」并同步更新 UI。
 *
 * @param {Object} station - 车站对象
 */
function addTransferLine(station) {
    if (!station.transferLines) station.transferLines = [];
    if (station.transferLines.length >= 4) return;

    station.transferLines.push({
        color: '#FF0000',
        nameCN: '新线路',
        nameEN: 'New Line',
        textMode: 'light',
        cnFontSize: 3.0,
        enFontSize: 2.0
    });

    // 自动设为换乘站
    station.type = '换乘站';

    // 同步站类型标签
    const item = document.getElementById(`station-${station.id}`);
    if (item) {
        const typeSpan = item.querySelector('.station-type');
        if (typeSpan) typeSpan.textContent = station.type;
        updateTransferPanel(item, station);
    }

    renderPIDSDisplay();
    scheduleSave();
}

/**
 * removeTransferLine - 删除车站的指定换乘线路
 *
 * 若删除后无线路，自动将车站类型恢复为「普通站」。
 *
 * @param {Object} station - 车站对象
 * @param {number} index   - 要删除的线路索引
 */
function removeTransferLine(station, index) {
    if (!station.transferLines) return;
    station.transferLines.splice(index, 1);

    // 无换乘线路时恢复普通站
    if (station.transferLines.length === 0) {
        station.type = '普通站';
    }

    // 同步站类型标签
    const item = document.getElementById(`station-${station.id}`);
    if (item) {
        const typeSpan = item.querySelector('.station-type');
        if (typeSpan) typeSpan.textContent = station.type;
        updateTransferPanel(item, station);
    }

    renderPIDSDisplay();
    scheduleSave();
}

/**
 * updateTransferPanel - 根据车站 transferLines 刷新换乘配置面板
 *
 * 移除旧面板，若存在换乘线路则重建新面板。
 *
 * @param {HTMLElement} item    - 车站项的 DOM 元素
 * @param {Object}      station - 车站对象
 */
function updateTransferPanel(item, station) {
    // 移除已有面板
    const existing = item.querySelector('.transfer-lines-panel');
    if (existing) existing.remove();

    // 无换乘线路不显示面板
    if (!station.transferLines || station.transferLines.length === 0) return;

    const panel = document.createElement('div');
    panel.className = 'transfer-lines-panel';

    // 面板标题
    const header = document.createElement('div');
    header.className = 'transfer-lines-panel-header';
    header.textContent = `换乘线路 (${station.transferLines.length}/4)`;
    panel.appendChild(header);

    // 各线路编辑行
    station.transferLines.forEach((lineData, idx) => {
        panel.appendChild(createTransferLineRow(station, lineData, idx));
    });

    // 添加按钮（未满 4 条时）
    if (station.transferLines.length < 4) {
        const addBtn = document.createElement('button');
        addBtn.className = 'transfer-line-add-btn';
        addBtn.textContent = '+ 添加换乘线路';
        addBtn.addEventListener('click', () => {
            addTransferLine(station);
        });
        panel.appendChild(addBtn);
    }

    item.appendChild(panel);
}

function addStation() {
    const station = createStationData();
    stations.push(station);
    const item = createStationItem(station);
    stationList.appendChild(item);
    updatePlaybackButtons();
    scheduleSave();
    renderPIDSDisplay();
}

function deleteStation(stationId) {
    stations = stations.filter(s => s.id !== stationId);
    // 调整 currentStationIndex（删除的站在当前站之前或就是当前站）
    if (stations.length === 0) {
        currentStationIndex = -1;
    } else if (currentStationIndex >= stations.length) {
        currentStationIndex = stations.length - 1;
    }
    updatePlaybackButtons();
    scheduleSave();
    rebuildStationList();
    renderPIDSDisplay();
}

/**
 * resetStations - 重置所有车站
 *
 * 弹出确认对话框，用户确认后清空车站列表并重新渲染。
 */
function resetStations() {
    if (!confirm('本操作将删除所有的车站，是否继续？')) return;
    pauseAutoRun();
    stations = [];
    stationCounter = 0;
    currentStationIndex = -1;
    stationList.innerHTML = '';
    updatePlaybackButtons();
    scheduleSave();
    renderPIDSDisplay();
}

/**
 * reverseStations - 一键反向车站顺序
 *
 * 将车站数组逆序排列，同步更新 currentStationIndex，
 * 模拟反方向运行时的车站顺序切换。
 */
function reverseStations() {
    if (stations.length <= 1) return;
    stations.reverse();
    if (currentStationIndex >= 0) {
        currentStationIndex = stations.length - 1 - currentStationIndex;
    }
    updatePlaybackButtons();
    scheduleSave();
    rebuildStationList();
    renderPIDSDisplay();
}

/**
 * resetLine - 完全初始化全部配置
 *
 * 清除 localStorage 缓存，将所有线路参数、车站、时间、背景
 * 恢复为 CONFIG 默认值，并同步更新所有 UI 控件和 PIDS 显示。
 */
function resetLine() {
    if (!confirm('此操作将清除缓存并重置全部配置为默认值，是否继续？')) return;

    // 清除 localStorage 缓存
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        // 静默失败
    }

    // 重置线路状态
    line.color = CONFIG.defaultColor;
    line.length = CONFIG.defaultLength;
    line.strokeWidth = CONFIG.defaultStrokeWidth;
    line.positionY = CONFIG.defaultPositionY;
    line.iconSize = CONFIG.defaultIconSize;
    line.nameFontSize = CONFIG.defaultNameFontSize;
    line.nameDisplayMode = CONFIG.defaultNameDisplayMode;
    line.bannerTextColor = CONFIG.defaultBannerTextColor;
    line.stationNameColor = CONFIG.defaultStationNameColor;
    line.trainFormation = CONFIG.defaultTrainFormation;
    line.stopPosition = CONFIG.defaultStopPosition;
    line.direction = CONFIG.defaultDirection;
    line.arrowScaleW = CONFIG.defaultArrowScaleW;
    line.arrowScaleH = CONFIG.defaultArrowScaleH;
    line.arrowColor = CONFIG.defaultArrowColor;
    line.arrowBlinkSpeed = CONFIG.defaultArrowBlinkSpeed;
    line.arrowStrokeWidth = CONFIG.defaultArrowStrokeWidth;

    // 重置车站
    stations = [];
    stationCounter = 0;

    // 重置时间状态
    const now = new Date();
    timeState.useSystemTime = true;
    timeState.year = now.getFullYear();
    timeState.month = now.getMonth() + 1;
    timeState.day = now.getDate();
    timeState.hour = now.getHours();
    timeState.minute = now.getMinutes();

    // 重置 PIDS 背景
    pidsBackground.type = 'color';
    pidsBackground.color = '#ffffff';
    pidsBackground.image = null;
    pidsBackground.imageSize = 'cover';
    pidsBackground.imageOpacity = 0.5;

    // 重置换乘切换
    transferToggle = false;
    currentStationBlink = true;
    isDeparted = false;

    // 同步所有 UI 控件
    colorInput.value = line.color;
    colorPreview.style.backgroundColor = line.color;
    bannerTextColorSelect.value = line.bannerTextColor;
    stationNameColorInput.value = line.stationNameColor;
    stationNameColorPreview.style.backgroundColor = line.stationNameColor;
    lengthInput.value = line.length;
    lengthValue.textContent = line.length;
    strokeInput.value = line.strokeWidth;
    strokeValue.textContent = line.strokeWidth;
    positionInput.value = line.positionY;
    positionValue.textContent = line.positionY.toFixed(2);
    iconSizeInput.value = line.iconSize;
    iconSizeValue.textContent = line.iconSize;
    nameModeSelect.value = line.nameDisplayMode;
    nameFontSizeInput.value = line.nameFontSize;
    nameFontSizeValue.textContent = line.nameFontSize;
    trainFormationInput.value = line.trainFormation;
    stopPositionSelect.value = line.stopPosition;
    directionSelect.value = line.direction;
    arrowScaleWInput.value = line.arrowScaleW;
    arrowScaleWValue.textContent = line.arrowScaleW.toFixed(1);
    arrowScaleHInput.value = line.arrowScaleH;
    arrowScaleHValue.textContent = line.arrowScaleH.toFixed(1);
    arrowColorInput.value = line.arrowColor;
    arrowColorPreview.style.backgroundColor = line.arrowColor;
    arrowBlinkInput.value = line.arrowBlinkSpeed;
    arrowBlinkValue.textContent = line.arrowBlinkSpeed;
    arrowStrokeWidthInput.value = line.arrowStrokeWidth;
    arrowStrokeWidthValue.textContent = line.arrowStrokeWidth;
    restartArrowAnimation();

    // PIDS 背景控件
    pidsBgType.value = 'color';
    pidsBgColorInput.value = '#ffffff';
    pidsBgColorPreview.style.backgroundColor = '#ffffff';
    pidsBgColorGroup.classList.remove('pids-bg-hidden');
    pidsBgImageGroup.classList.add('pids-bg-hidden');
    pidsBgSizeRow.style.display = 'none';
    pidsBgImageInput.value = '';
    pidsBgOpacityInput.value = 50;
    pidsBgOpacityValue.textContent = '50';

    // 时间控件
    useSystemTimeCheck.checked = true;
    setTimeInputsState();
    syncTimeInputsToState();

    // 车站列表
    rebuildStationList();

    // 画面切换状态
    pauseAutoRun();
    currentStationIndex = -1;
    updatePlaybackButtons();

    // 渲染
    renderBanner();
    renderPIDSDisplay();
    applyPidsBackground();
}

// ========== 画面切换控制 ==========

/**
 * goToStart - 回到起点站
 *
 * 将列车重置到第一个车站且处于停站状态。
 */
function goToStart() {
    if (stations.length === 0) return;
    isDeparted = false;
    transferToggle = false;
    currentStationIndex = 0;
    currentStationBlink = true;
    scheduleSave();
    renderPIDSDisplay();
}

/**
 * updatePlaybackButtons - 同步按钮视觉状态
 *
 * 自动运行中：按钮高亮显示「⏸ 暂停」；
 * 暂停中：按钮常规显示「▶ 自动运行」。
 */
function updatePlaybackButtons() {
    if (isAutoRunning) {
        btnAutoRun.classList.add('btn-playback-active');
        btnAutoRun.textContent = '⏸ 暂停';
    } else {
        btnAutoRun.classList.remove('btn-playback-active');
        btnAutoRun.textContent = '▶ 自动运行';
    }
    // 没有车站时禁用步进按钮
    const hasStations = stations.length > 0;
    btnPrevStep.disabled = !hasStations;
    btnNextStep.disabled = !hasStations;
    btnAutoRun.disabled = !hasStations;
    btnGoToStart.disabled = !hasStations;
}

/**
 * goNextStep - 推进一个运行阶段
 *
 * 运行周期：停站 → 离站(区间运行) → 下一站停站 → 离站 → …
 * - 停站中（isDeparted=false）：发车 → isDeparted=true
 * - 区间中（isDeparted=true）：到达下一站 → isDeparted=false, currentStationIndex+1
 *
 * 如果没有车站则不做任何操作。
 */
function goNextStep() {
    if (stations.length === 0) return;
    transferToggle = false;  // 手动步进时恢复普通样式
    if (isDeparted) {
        // 区间运行中 → 到达下一站
        isDeparted = false;
        currentStationIndex = (currentStationIndex + 1) % stations.length;
    } else if (currentStationIndex === stations.length - 1) {
        // 终点站停站中 → 直接跳回起点站
        isDeparted = false;
        currentStationIndex = 0;
        currentStationBlink = true;
    } else {
        // 停站中 → 发车进入区间
        isDeparted = true;
    }
    scheduleSave();
    renderPIDSDisplay();
}

/**
 * goPrevStep - 回退一个运行阶段
 *
 * goNextStep 的逆操作：
 * - 区间中（isDeparted=true）：退回上一站停站 → isDeparted=false
 * - 停站中（isDeparted=false）：退回上一段区间 → isDeparted=true, currentStationIndex-1
 *
 * 如果没有车站则不做任何操作。
 */
function goPrevStep() {
    if (stations.length === 0) return;
    transferToggle = false;  // 手动步进时恢复普通样式
    if (isDeparted) {
        // 区间运行中 → 退回停站
        isDeparted = false;
    } else if (currentStationIndex === 0) {
        // 起点站停站中 → 直接跳回终点站
        isDeparted = false;
        currentStationIndex = stations.length - 1;
        currentStationBlink = true;
    } else {
        // 停站中 → 退回上一段区间
        isDeparted = true;
        currentStationIndex = (currentStationIndex - 1 + stations.length) % stations.length;
    }
    scheduleSave();
    renderPIDSDisplay();
}

/**
 * startAutoRun - 开始自动运行
 *
 * 按时 interval 自动推进 currentStationIndex。
 * 如果已在运行或没有车站则不做任何操作。
 */
function startAutoRun() {
    if (isAutoRunning || stations.length === 0) return;
    isAutoRunning = true;
    updatePlaybackButtons();

    // 如果当前无选中，从第一个开始
    if (currentStationIndex < 0) {
        currentStationIndex = 0;
        renderPIDSDisplay();
    }

    autoRunIntervalId = setInterval(() => {
        goNextStep();
    }, AUTO_RUN_DELAY);
}

/**
 * pauseAutoRun - 暂停自动运行
 */
/**
 * startTransferToggle - 启动换乘站样式切换定时器
 *
 * 每 3 秒翻转 transferToggle，仅在存在换乘站时触发渲染。
 */
function startTransferToggle() {
    if (transferToggleTimer) return;
    transferToggleTimer = setInterval(() => {
        const hasTransferStation = stations.some(
            s => s.type === '换乘站' && s.transferLines && s.transferLines.length > 0
        );
        if (hasTransferStation) {
            transferToggle = !transferToggle;
            renderPIDSDisplay();
        }
    }, 3000);
}

/**
 * startArrowAnimation - 启动站间箭头动画定时器
 *
 * 每 300ms 轮换 arrowFrame (0→1→2→0)，
 * 仅在车站数 ≥ 2 时触发渲染。
 */
function startArrowAnimation() {
    if (arrowAnimTimer) return;
    arrowAnimTimer = setInterval(() => {
        if (isDeparted) {
            arrowFrame = (arrowFrame + 1) % 3;
        } else {
            arrowFrame = 2;  // 停站时箭头固定不闪烁
        }
        if (stations.length > 1) {
            renderPIDSDisplay();
        }
    }, line.arrowBlinkSpeed);
}

/**
 * restartArrowAnimation - 以新的闪烁间隔重启箭头动画
 *
 * 当箭头闪烁时间控件改变时调用，先清除旧定时器再重建。
 */
function restartArrowAnimation() {
    if (arrowAnimTimer) {
        clearInterval(arrowAnimTimer);
        arrowAnimTimer = null;
    }
    arrowAnimTimer = setInterval(() => {
        if (isDeparted) {
            arrowFrame = (arrowFrame + 1) % 3;
        } else {
            arrowFrame = 2;
        }
        if (stations.length > 1) {
            renderPIDSDisplay();
        }
    }, line.arrowBlinkSpeed);
}

/**
 * startCurrentStationBlink - 启动当前站黄色闪烁定时器
 *
 * 每 500ms 翻转 currentStationBlink，驱动当前站圆圈在黄色与白色之间切换。
 * 仅在存在当前高亮站时触发渲染。
 */
function startCurrentStationBlink() {
    if (currentStationBlinkTimer) return;
    currentStationBlinkTimer = setInterval(() => {
        currentStationBlink = !currentStationBlink;
        if (currentStationIndex >= 0 && stations.length > 0) {
            renderPIDSDisplay();
        }
    }, CURRENT_STATION_BLINK_DELAY);
}

function pauseAutoRun() {
    if (!isAutoRunning) return;
    isAutoRunning = false;
    if (autoRunIntervalId) {
        clearInterval(autoRunIntervalId);
        autoRunIntervalId = null;
    }
    updatePlaybackButtons();
}

/**
 * toggleAutoRun - 切换自动运行 / 暂停
 */
function toggleAutoRun() {
    if (isAutoRunning) {
        pauseAutoRun();
    } else {
        startAutoRun();
    }
}

/**
 * rebuildStationList - 清空并重建整个车站列表 DOM
 *
 * 用于排序变更后需要重新生成所有车站项的场景。
 * 每个车站项的序号（station-index）会重新计算。
 */
function rebuildStationList() {
    stationList.innerHTML = '';
    stations.forEach(station => {
        stationList.appendChild(createStationItem(station));
    });
}

/**
 * moveStation - 上移/下移车站
 *
 * @param {number} stationId - 要移动的车站 ID
 * @param {string} direction  - 'up' 上移（索引-1）| 'down' 下移（索引+1）
 */
function moveStation(stationId, direction) {
    const idx = stations.findIndex(s => s.id === stationId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= stations.length) return;

    // 交换数组元素
    [stations[idx], stations[targetIdx]] = [stations[targetIdx], stations[idx]];

    // 跟踪当前高亮站
    if (currentStationIndex === idx) {
        currentStationIndex = targetIdx;
    } else if (currentStationIndex === targetIdx) {
        currentStationIndex = idx;
    }

    scheduleSave();
    rebuildStationList();
    renderPIDSDisplay();
}

// ========== 事件绑定 ==========

colorInput.addEventListener('input', (e) => {
    line.color = e.target.value;
    colorPreview.style.backgroundColor = line.color;
    renderPIDSDisplay();
    scheduleSave();
});

bannerTextColorSelect.addEventListener('change', (e) => {
    line.bannerTextColor = e.target.value;
    renderBanner();
    scheduleSave();
});

stationNameColorInput.addEventListener('input', (e) => {
    line.stationNameColor = e.target.value;
    stationNameColorPreview.style.backgroundColor = line.stationNameColor;
    renderPIDSDisplay();
    scheduleSave();
});

// ========== PIDS 背景事件 ==========

pidsBgType.addEventListener('change', () => {
    pidsBackground.type = pidsBgType.value;
    if (pidsBackground.type === 'color') {
        pidsBgColorGroup.classList.remove('pids-bg-hidden');
        pidsBgImageGroup.classList.add('pids-bg-hidden');
    } else {
        // 纹理图片模式：背景自动设为白色
        pidsBackground.color = '#ffffff';
        pidsBgColorInput.value = '#ffffff';
        pidsBgColorPreview.style.backgroundColor = '#ffffff';
        pidsBgColorGroup.classList.add('pids-bg-hidden');
        pidsBgImageGroup.classList.remove('pids-bg-hidden');
    }
    applyPidsBackground();
    scheduleSave();
});

pidsBgColorInput.addEventListener('input', () => {
    pidsBackground.color = pidsBgColorInput.value;
    pidsBgColorPreview.style.backgroundColor = pidsBackground.color;
    applyPidsBackground();
    scheduleSave();
});

pidsBgImageInput.addEventListener('change', () => {
    const file = pidsBgImageInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        pidsBackground.image = e.target.result;
        pidsBgSizeRow.style.display = 'block';
        applyPidsBackground();
        scheduleSave();
    };
    reader.readAsDataURL(file);
});

pidsBgImageSize.addEventListener('change', () => {
    pidsBackground.imageSize = pidsBgImageSize.value;
    applyPidsBackground();
    scheduleSave();
});

pidsBgClearImage.addEventListener('click', () => {
    pidsBackground.image = null;
    pidsBgImageInput.value = '';
    pidsBgSizeRow.style.display = 'none';
    applyPidsBackground();
    scheduleSave();
});

pidsBgOpacityInput.addEventListener('input', () => {
    pidsBackground.imageOpacity = parseInt(pidsBgOpacityInput.value, 10) / 100;
    pidsBgOpacityValue.textContent = pidsBgOpacityInput.value;
    applyPidsBackground();
    scheduleSave();
});

// ========== 时间控制事件 ==========

function setTimeInputsState() {
    const disabled = timeState.useSystemTime;
    timeInputs.classList.toggle('active', !disabled);
    timeYear.disabled = disabled;
    timeMonth.disabled = disabled;
    timeDay.disabled = disabled;
    timeHour.disabled = disabled;
    timeMinute.disabled = disabled;
}

function syncTimeInputsToState() {
    const d = getDisplayTime();
    timeYear.value = d.getFullYear();
    timeMonth.value = d.getMonth() + 1;
    timeDay.value = d.getDate();
    timeHour.value = d.getHours();
    timeMinute.value = d.getMinutes();
    updateTimeDisplay();
}

useSystemTimeCheck.addEventListener('change', () => {
    timeState.useSystemTime = useSystemTimeCheck.checked;
    setTimeInputsState();
    syncTimeInputsToState();
    renderBanner();
    scheduleSave();
});

[timeYear, timeMonth, timeDay, timeHour, timeMinute].forEach(input => {
    input.addEventListener('change', () => {
        timeState.year = parseInt(timeYear.value, 10) || 2025;
        timeState.month = parseInt(timeMonth.value, 10) || 1;
        timeState.day = parseInt(timeDay.value, 10) || 1;
        timeState.hour = parseInt(timeHour.value, 10) || 0;
        timeState.minute = parseInt(timeMinute.value, 10) || 0;
        updateTimeDisplay();
        renderBanner();
        scheduleSave();
    });
});

lengthInput.addEventListener('input', (e) => {
    line.length = parseInt(e.target.value, 10);
    lengthValue.textContent = line.length;
    renderPIDSDisplay();
    scheduleSave();
});

strokeInput.addEventListener('input', (e) => {
    line.strokeWidth = parseInt(e.target.value, 10);
    strokeValue.textContent = line.strokeWidth;
    renderPIDSDisplay();
    scheduleSave();
});

positionInput.addEventListener('input', (e) => {
    line.positionY = parseFloat(e.target.value);
    positionValue.textContent = line.positionY.toFixed(2);
    renderPIDSDisplay();
    scheduleSave();
});

iconSizeInput.addEventListener('input', (e) => {
    line.iconSize = parseInt(e.target.value, 10);
    iconSizeValue.textContent = line.iconSize;
    renderPIDSDisplay();
    scheduleSave();
});

nameModeSelect.addEventListener('change', (e) => {
    line.nameDisplayMode = e.target.value;
    renderPIDSDisplay();
    scheduleSave();
});

nameFontSizeInput.addEventListener('input', (e) => {
    line.nameFontSize = parseInt(e.target.value, 10);
    nameFontSizeValue.textContent = line.nameFontSize;
    renderPIDSDisplay();
    scheduleSave();
});

trainFormationInput.addEventListener('change', () => {
    line.trainFormation = trainFormationInput.value;
    scheduleSave();
});

stopPositionSelect.addEventListener('change', () => {
    line.stopPosition = stopPositionSelect.value;
    scheduleSave();
});

directionSelect.addEventListener('change', () => {
    line.direction = directionSelect.value;
    renderPIDSDisplay();
    scheduleSave();
});

arrowScaleWInput.addEventListener('input', () => {
    line.arrowScaleW = parseFloat(arrowScaleWInput.value);
    arrowScaleWValue.textContent = line.arrowScaleW.toFixed(1);
    renderPIDSDisplay();
    scheduleSave();
});

arrowScaleHInput.addEventListener('input', () => {
    line.arrowScaleH = parseFloat(arrowScaleHInput.value);
    arrowScaleHValue.textContent = line.arrowScaleH.toFixed(1);
    renderPIDSDisplay();
    scheduleSave();
});

arrowColorInput.addEventListener('input', () => {
    line.arrowColor = arrowColorInput.value;
    arrowColorPreview.style.backgroundColor = line.arrowColor;
    renderPIDSDisplay();
    scheduleSave();
});

arrowBlinkInput.addEventListener('input', () => {
    line.arrowBlinkSpeed = parseInt(arrowBlinkInput.value, 10);
    arrowBlinkValue.textContent = line.arrowBlinkSpeed;
    restartArrowAnimation();
    scheduleSave();
});

arrowStrokeWidthInput.addEventListener('input', () => {
    line.arrowStrokeWidth = parseInt(arrowStrokeWidthInput.value, 10);
    arrowStrokeWidthValue.textContent = line.arrowStrokeWidth;
    renderPIDSDisplay();
    scheduleSave();
});

addStationBtn.addEventListener('click', addStation);
resetStationBtn.addEventListener('click', resetStations);
reverseStationBtn.addEventListener('click', reverseStations);
resetLineBtn.addEventListener('click', resetLine);

exportConfigBtn.addEventListener('click', exportConfig);
importConfigBtn.addEventListener('click', () => importConfigInput.click());
importConfigInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        importConfig(e.target.files[0]);
        e.target.value = '';
    }
});

btnGoToStart.addEventListener('click', goToStart);
btnPrevStep.addEventListener('click', goPrevStep);
btnNextStep.addEventListener('click', goNextStep);
btnAutoRun.addEventListener('click', toggleAutoRun);

// ========== 初始化 ==========

// 0. 清理旧版缓存中可能残留的 image data URL（体积过大导致线上保存失败）
//    在恢复状态前执行，确保后续保存不会再包含 image 字段
(function cleanupStaleImageData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const old = JSON.parse(raw);
        if (old.pidsBackground && old.pidsBackground.image) {
            // 旧数据含 image data URL → 删除后写回，释放配额空间
            delete old.pidsBackground.image;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
            console.log('[PIDS] 已清理缓存中的背景图片数据，释放存储空间');
        }
    } catch (_) {}
})();

// 1. 尝试从 localStorage 恢复状态
loadState();

// 1.5 启动换乘切换定时器
startTransferToggle();

// 1.6 启动站间箭头动画定时器
startArrowAnimation();

// 1.7 启动当前站黄色闪烁定时器
startCurrentStationBlink();

// 2. 同步所有 UI 控件到当前状态（默认值或恢复值）
colorInput.value = line.color;
colorPreview.style.backgroundColor = line.color;
bannerTextColorSelect.value = line.bannerTextColor;
stationNameColorInput.value = line.stationNameColor;
stationNameColorPreview.style.backgroundColor = line.stationNameColor;
lengthInput.value = line.length;
lengthValue.textContent = line.length;
strokeInput.value = line.strokeWidth;
strokeValue.textContent = line.strokeWidth;
positionInput.value = line.positionY;
positionValue.textContent = line.positionY.toFixed(2);
iconSizeInput.value = line.iconSize;
iconSizeValue.textContent = line.iconSize;
nameModeSelect.value = line.nameDisplayMode;
nameFontSizeInput.value = line.nameFontSize;
nameFontSizeValue.textContent = line.nameFontSize;
trainFormationInput.value = line.trainFormation;
stopPositionSelect.value = line.stopPosition;
directionSelect.value = line.direction;
arrowScaleWInput.value = line.arrowScaleW;
arrowScaleWValue.textContent = line.arrowScaleW.toFixed(1);
arrowScaleHInput.value = line.arrowScaleH;
arrowScaleHValue.textContent = line.arrowScaleH.toFixed(1);
arrowColorInput.value = line.arrowColor;
arrowColorPreview.style.backgroundColor = line.arrowColor;
arrowBlinkInput.value = line.arrowBlinkSpeed;
arrowBlinkValue.textContent = line.arrowBlinkSpeed;
arrowStrokeWidthInput.value = line.arrowStrokeWidth;
arrowStrokeWidthValue.textContent = line.arrowStrokeWidth;

// PIDS 背景控件
pidsBgType.value = pidsBackground.type;
pidsBgColorInput.value = pidsBackground.color;
pidsBgColorPreview.style.backgroundColor = pidsBackground.color;
if (pidsBackground.type === 'image') {
    pidsBgColorGroup.classList.add('pids-bg-hidden');
    pidsBgImageGroup.classList.remove('pids-bg-hidden');
    if (pidsBackground.image) {
        pidsBgSizeRow.style.display = 'block';
        pidsBgImageSize.value = pidsBackground.imageSize;
    }
}
pidsBgOpacityInput.value = Math.round(pidsBackground.imageOpacity * 100);
pidsBgOpacityValue.textContent = Math.round(pidsBackground.imageOpacity * 100);

// 时间控件
useSystemTimeCheck.checked = timeState.useSystemTime;
setTimeInputsState();
syncTimeInputsToState();

// 车站列表
rebuildStationList();

// 确保 currentStationIndex 在有效范围
if (stations.length === 0) {
    currentStationIndex = -1;
} else if (currentStationIndex >= stations.length) {
    currentStationIndex = stations.length - 1;
}

// 画面切换按钮状态
updatePlaybackButtons();

// 3. 启用保存（防止初始化期间的渲染触发保存）
saveReady = true;
if (SAVE_DEBUG) console.log('[PIDS] saveReady=true，保存机制已启用');

// 3.1 全局保存安全网：页面关闭/刷新前强制保存（跳过防抖，直接写入）
window.addEventListener('beforeunload', () => {
    saveState();
});

// 3.2 定期自动保存：每 10 秒兜底一次（防止事件遗漏导致数据丢失）
autoSaveIntervalId = setInterval(() => {
    if (saveReady) saveState();
}, 10000);

// 4. 渲染
renderPIDSDisplay();
applyPidsBackground();
resizePIDS();

// 系统时间模式下每秒刷新 banner 时间
setInterval(() => {
    if (timeState.useSystemTime) {
        renderBanner();
    }
}, 1000);

// 窗口大小改变时重新计算 PIDS 尺寸
window.addEventListener('resize', resizePIDS);

// 暴露到全局（方便调试）
window.PIDS = {
    line,
    stations,
    timeState,
    pidsBackground,
    transferToggle,
    currentStationBlink,
    isDeparted,
    startCurrentStationBlink,
    renderPIDSDisplay,
    getLineY,
    renderBanner,
    applyPidsBackground,
    resizePIDS,
    buildStationNameSvg,
    buildTransferIcon,
    buildTransferIconGray,
    buildTransferLineFrame,
    buildTransferFrames,
    buildArrowSvg,
    restartArrowAnimation,
    arrowFrame,
    addStation,
    deleteStation,
    moveStation,
    rebuildStationList,
    resetStations,
    reverseStations,
    resetLine,
    saveState,
    loadState,
    addTransferLine,
    removeTransferLine,
    updateTransferPanel,
    startTransferToggle,
    goNextStep,
    goPrevStep,
    startAutoRun,
    pauseAutoRun,
    toggleAutoRun,
    updatePlaybackButtons
};
