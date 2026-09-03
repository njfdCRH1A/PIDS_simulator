/**
 * 地铁PIDS显示器模拟器 - 主脚本
 * 单线路模式 + 车站编辑 + 站名显示
 */

// ========== 配置 ==========
const CONFIG = {
    minLength: 0,
    maxLength: 1,
    defaultLength: 1,
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
    defaultTrainCars: [
        { number: 1, isHead: true },
        { number: 2, isHead: false },
        { number: 3, isHead: false },
        { number: 4, isHead: false },
        { number: 5, isHead: false },
        { number: 6, isHead: true }
    ],
    defaultStopPosition: 'center',
    defaultDirection: 'left',
    defaultArrowScaleW: 1.0,
    defaultArrowScaleH: 1.0,
    defaultArrowColor: '#ffffff',
    defaultArrowBlinkSpeed: 300,
    defaultArrowStrokeWidth: 4
};

const VIEWBOX_HEIGHT = 445;  // 线路 viewBox 高度：与总体 2700×540 统一（banner=95, line=445）
const SCALE = 6.4;           // 坐标统一化缩放因子：421.875 → 2700（×6.4），69.5 → 445（≈×6.4）

/**
 * getLineY - 将线路位置比例 (0~1) 换算为 viewBox Y 坐标
 *
 * 0 = 最靠上, 1 = 最靠下。
 *
 * @returns {number} 线路矩形顶边的 viewBox Y 坐标
 */
function getLineY() {
    return line.positionY * (VIEWBOX_HEIGHT - line.strokeWidth * SCALE);
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
    trainCars: CONFIG.defaultTrainCars.map(c => ({ ...c })),
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

// ========== 本侧开门停站画面状态 ==========
let stopDisplayKind = null;        // 停站开门画面类型: 'this' | 'opposite' | null
let thisSidePanelMode = 'station'; // 本侧开门右侧面板: 'station'(本站/站名) | 'date'(日期)
let thisSidePanelTimer = null;     // 右侧面板 10s/2s 循环定时器（setTimeout 链）
let doorOpenAmount = 0;            // 车门开门进度 0(关)~1(开)
let doorAnimTimer = null;          // 车门开门动画定时器
let doorArrowProgress = 0;         // 绿色上箭头行程 0(底)~1(顶)
let doorArrowTimer = null;         // 绿色上箭头动画定时器
let doorArrowActive = false;       // 门全开后是否显示绿色上箭头
const THIS_SIDE_STATION_MS = 10000; // 「本站/站名」显示时长（毫秒）
const THIS_SIDE_DATE_MS = 2000;     // 「日期」显示时长（毫秒）
const DOOR_ANIM_DELAY = 50;         // 开门动画步进间隔（毫秒）
const DOOR_OPEN_STEPS = 30;         // 开门总步数（约 1.5 秒开完）
const DOOR_ARROW_DELAY = 80;        // 绿色上箭头步进间隔（毫秒）
const DOOR_ARROW_STEPS = 20;        // 上箭头单趟步数（约 1.6 秒一趟）

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
 * migrateTrainCars - 迁移旧版列车编组字符串到车厢数组
 *
 * 旧版 trainFormation 为 "车厢号,类型" 每行一条的字符串，
 * 其中类型 1=朝右车头, -1=朝左车头, 0=中间车。
 * 新版 line.trainCars 为 [{ number, isHead }] 数组，
 * 车头方向改由列车编组位置 + 运行方向自动决定，故 isHead = 类型非 0。
 * 若新版字段已存在则不做任何事。
 *
 * 依赖: line (全局), CONFIG.defaultTrainCars
 */
function migrateTrainCars() {
    // 旧版 trainFormation 字符串存在 → 迁移（覆盖默认/已有 trainCars）
    // 判断依据：旧数据经 Object.assign 后 line.trainFormation 为非空字符串
    if (typeof line.trainFormation === 'string' && line.trainFormation.trim()) {
        const parsed = [];
        line.trainFormation.split('\n').forEach(rawLine => {
            const parts = rawLine.trim().split(',');
            if (parts.length < 2) return;
            const number = parseInt(parts[0], 10);
            const type = parseInt(parts[1], 10);
            if (isNaN(number)) return;
            parsed.push({ number: number, isHead: type !== 0 });
        });
        if (parsed.length > 0) {
            line.trainCars = parsed;
            delete line.trainFormation;  // 迁移成功后清除旧字段，避免再次序列化
            return;
        }
    }

    // 无旧数据 → 兜底默认编组（仅当 trainCars 缺失或为空时）
    if (!Array.isArray(line.trainCars) || line.trainCars.length === 0) {
        line.trainCars = CONFIG.defaultTrainCars.map(c => ({ ...c }));
    }
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
            // 迁移旧版 length 绝对值 (10~300) → 比例值 (0~1)
            if (line.length > 1) line.length = Math.min(1, line.length / 300);
            // 迁移旧版 trainFormation 字符串 → trainCars 数组
            migrateTrainCars();
        }
        if (state.stations) stations = state.stations.slice();
        if (state.stationCounter !== undefined) stationCounter = state.stationCounter;
        // 迁移：确保旧数据中所有车站都有 transferLines 字段，且类型与换乘数据一致
        stations.forEach(s => {
            if (!s.transferLines) s.transferLines = [];
            if (s.transferLines.length > 0) s.type = '换乘站';
            // 迁移：旧数据中缺少 doorSide 字段时默认为本侧开门
            if (s.doorSide === undefined) s.doorSide = true;
            // 迁移：旧数据中缺少 isUnderground 字段时默认为地上站
            if (s.isUnderground === undefined) s.isUnderground = false;
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
            // 迁移旧版 trainFormation 字符串 → trainCars 数组
            migrateTrainCars();

            // 应用车站
            stations = data.stations.slice();
            // 迁移：确保导入数据中所有车站都有 doorSide 字段
            stations.forEach(s => {
                if (s.doorSide === undefined) s.doorSide = true;
                if (s.isUnderground === undefined) s.isUnderground = false;
            });
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

            // 重置画面状态，自动定位到第一个站
            currentStationIndex = (stations.length > 0) ? 0 : -1;
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
            lengthValue.textContent = Math.round(line.length * 100) + '%';
            strokeInput.value = line.strokeWidth;
            strokeValue.textContent = line.strokeWidth;
            positionInput.value = line.positionY;
            positionValue.textContent = line.positionY.toFixed(2);
            iconSizeInput.value = line.iconSize;
            iconSizeValue.textContent = line.iconSize;
            nameModeSelect.value = line.nameDisplayMode;
            nameFontSizeInput.value = line.nameFontSize;
            nameFontSizeValue.textContent = line.nameFontSize;
            renderTrainCarList();
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
const trainCarList = document.getElementById('trainCarList');
const addTrainCarBtn = document.getElementById('addTrainCarBtn');
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

    // 2700:540 比例（5:1 长条屏，CSS aspect-ratio 负责等比缩放）。
    // .pids-display-wrapper 为 content-box：aspect-ratio 作用于内容盒，
    // 12px×2 padding 占用额外空间，故按内容盒（avail - 24）计算，保证屏幕严格 5:1。
    const RATIO_W = 2700, RATIO_H = 540;
    const WRAP_PAD = 24;  // 12px × 2（左右/上下）
    const contentW = availW - WRAP_PAD;
    const contentH = availH - WRAP_PAD;
    const hFromW = contentW * RATIO_H / RATIO_W;

    if (hFromW <= contentH) {
        // 宽度先达到限制：设内容盒宽度，高度由 CSS aspect-ratio 自动计算
        pidsWrapper.style.width = contentW + 'px';
        pidsWrapper.style.height = 'auto';
    } else {
        // 高度先达到限制：设内容盒高度，宽度由 CSS aspect-ratio 自动计算
        pidsWrapper.style.height = contentH + 'px';
        pidsWrapper.style.width = 'auto';
    }
}

// ========== 站名 SVG 生成 ==========

const FONT_FAMILY = "SimHei, '黑体', 'Microsoft YaHei', sans-serif";
const TEXT_PAD = 12.8;  // 文字与站点圆圈的间距（viewBox 单位，2700 坐标系）
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
    const cnSize = line.nameFontSize * SCALE;
    const secSize = cnSize / 2;
    const halfIcon = line.iconSize * SCALE / 2;

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
            const offset = halfIcon + 19.2;  // 与 buildDiagonalText 保持一致（+3×6.4）
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
function buildAlternatingText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, index, isPassed, isCurrent) {
    const isAbove = index % 2 === 0;
    const hasSec = !!secName;
    const gap = hasSec ? Math.max(6.4, secSize * 0.3) : 0;
    const textColor = (!isDeparted && isCurrent) ? '#f00' : (isPassed ? '#999' : line.stationNameColor);

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
function buildDiagonalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, isPassed, isCurrent) {
    const hasSec = !!secName;
    const gap = hasSec ? secSize * 0.1 : 0;
    const offset = halfIcon + 19.2;  // 贴近站点，向左上偏移（+3×6.4）
    const textColor = (!isDeparted && isCurrent) ? '#f00' : (isPassed ? '#999' : line.stationNameColor);

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
function buildVerticalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, direction, isPassed, isCurrent) {
    const hasSec = !!secName;
    const colGap = cnSize * 0.4;
    const textColor = (!isDeparted && isCurrent) ? '#f00' : (isPassed ? '#999' : line.stationNameColor);

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
function buildStationNameSvg(station, cx, cy, index, isPassed, isCurrent, nameMode) {
    const cnName = (station.name || '').trim();
    const secName = (station.secondaryName || '').trim();
    if (!cnName && !secName) return '';

    const cnSize = line.nameFontSize * SCALE;
    const secSize = cnSize / 2;
    const halfIcon = line.iconSize * SCALE / 2;

    switch (nameMode || line.nameDisplayMode) {
        case 'alternating':
            return buildAlternatingText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, index, isPassed, isCurrent);
        case 'diagonal':
            return buildDiagonalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, isPassed, isCurrent);
        case 'above':
            return buildVerticalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, 'above', isPassed, isCurrent);
        case 'below':
            return buildVerticalText(cx, cy, cnName, secName, cnSize, secSize, halfIcon, 'below', isPassed, isCurrent);
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

    const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2700 95" preserveAspectRatio="xMidYMid meet">
  <rect width="2700" height="95" fill="${line.color}"/>
  <path fill="#fff" d="M1902.23,90h-1104.61c-11.67,0-21.09-6.7-21.09-15V0h1146.80v75c0,8.3-9.42,15-21.09,15Z"/>
  <text x="2657.81" y="60" fill="${txtColor}" font-size="44" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">${timeStr}</text>
  <text x="2081.25" y="45" fill="${txtColor}" fill-opacity="0.85" font-size="30" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">开往：</text>
  <text x="2250" y="45" fill="${txtColor}" fill-opacity="0.85" font-size="30" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${destCnName}</text>
  <text x="2074.22" y="65" fill="${txtColor}" fill-opacity="0.65" font-size="20" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">To：</text>
  <text x="2250" y="65" fill="${txtColor}" fill-opacity="0.65" font-size="15" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${destSecName}</text>
  <text x="801.56" y="42" fill="#000" font-size="24" font-family="${FONT_FAMILY}" font-weight="bold">${cnLabel}</text>
  <text x="1350" y="42" fill="#e94560" font-size="32" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${nameCN}</text>
  <text x="1898.44" y="42" fill="#000" font-size="24" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="end">${timeCN}</text>
  <text x="801.56" y="72" fill="#000" fill-opacity="0.85" font-size="15" font-family="${FONT_FAMILY}">${enLabel}</text>
  <text x="1350" y="72" fill="#e94560" fill-opacity="0.85" font-size="20" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle">${nameEN}</text>
  <text x="1898.44" y="72" fill="#000" fill-opacity="0.85" font-size="15" font-family="${FONT_FAMILY}" text-anchor="end">${timeEN}</text>
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
 * @param  {string} [innerFill] - 可选：内圆填充色（默认 #fff）
 * @returns {string} SVG g 元素字符串（含 3 个 path）
 */
function buildTransferIcon(cx, cy, size, innerFill) {
    // 内联 transfer.svg 路径 (viewBox="0 0 40 40")，等比缩放至 iconSize
    // 避免外部 <image> 加载失败导致图标隐形、与换乘框不同步
    const s = size / 40;
    const x = cx - size / 2;
    const y = cy - size / 2;
    const inner = innerFill || '#fff';
    return `<g transform="translate(${x}, ${y}) scale(${s})">
    <path fill="#231815" d="M20,0c11.05,0,20,8.95,20,20,0,10.92-8.76,19.8-19.63,20h-.37c-2.76,0-5.38-.55-7.77-1.56C5.04,35.4,0,28.29,0,20,0,9.08,8.76.2,19.63,0h.37Z"/>
    <path fill="${inner}" d="M20,4.44c-8.56,0-15.56,7-15.56,15.56,0,8.56,7,15.56,15.56,15.56,8.56,0,15.56-7,15.56-15.56,0-8.56-7-15.56-15.56-15.56Z"/>
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
 * getTransferDigitLayout - 「X号线」数字下沉式布局的几何参数
 *
 * 换乘线路名形如「X号线」且有英文名时，采用数字下沉式：
 *   左侧大字号数字（高约 1.5~2 行），右侧两行 —— 上行「号线」、下行「Line X」。
 * 非「X号线」或无英文名返回 null（走普通布局）。
 *
 * @param  {Object} lineData - {color, nameCN, nameEN, textMode}
 * @returns {Object|null} { digits, rest, enText, bigFS, digitGap, digitW, textColW, textH, segGap, cnFS, enFS } 或 null
 */
function getTransferDigitLayout(lineData) {
    const cnFS = 4.0 * SCALE;   // 换乘字号固定：中文 4 号
    const enFS = 2.0 * SCALE;   // 换乘字号固定：英文 2 号
    const cn = (lineData.nameCN || '');
    const m = cn.match(/^(\d+)(号线.*)$/);
    if (!m) return null;
    const enText = (lineData.nameEN || '').replace(/\\n/g, '\n').split('\n')[0];
    if (!enText) return null;   // 需英文名才有下行「Line X」
    const bigFS = cnFS * 2.0;       // 左侧大数字字号（约 2 行高）
    const digitGap = cnFS * 0.15;   // 数字与右侧文字间距（收紧）
    const digitW = bigFS * 0.5 * m[1].length;   // 数字串宽（数字约 0.5em）
    const restW = m[2].length * cnFS;           // 「号线…」全角宽度
    const enW = enText.length * enFS * 0.6;
    const textColW = Math.max(restW, enW);      // 右列两行较宽者
    const lnGap = 1.0;
    const segGap = 3.2;
    const textH = cnFS * lnGap + segGap + enFS * lnGap;  // 右侧两行总高
    return { digits: m[1], rest: m[2], enText, bigFS, digitGap, digitW, textColW, textH, segGap, cnFS, enFS };
}

/**
 * estimateTransferFrameSize - 估算换乘线路框的 SVG 尺寸
 *
 * 根据文字内容、字号、行数估算框宽和框高。
 * CN 每字符宽度 ≈ 字号，EN 每字符宽度 ≈ 字号 × 0.6。
 * 「X号线」数字下沉式按左侧大数字 + 右侧两行计算。
 *
 * @param  {Object} lineData - {color, nameCN, nameEN, textMode}
 * @returns {Object} { w, h, cnLines, enLines, cnFS, enFS }
 */
function estimateTransferFrameSize(lineData) {
    // 「X号线」数字下沉式：按数字 + 两行文字算宽高
    const dl = getTransferDigitLayout(lineData);
    if (dl) {
        const padX = 6.4, padY = 3.2;
        const w = Math.max(64, dl.digitW + dl.digitGap + dl.textColW + padX);
        const h = 50;   // 换乘框高度固定 50
        return { w, h, cnFS: dl.cnFS, enFS: dl.enFS };
    }
    const cnLines = (lineData.nameCN || '').replace(/\\n/g, '\n').split('\n');
    const enLines = (lineData.nameEN || '').replace(/\\n/g, '\n').split('\n');
    const cnFS = 4.0 * SCALE;   // 换乘字号固定：中文 4 号
    const enFS = 2.0 * SCALE;   // 换乘字号固定：英文 2 号
    const padX = 6.4;  // 左右各 3.2（×6.4）
    const padY = 3.2;  // 上 3.2、下 0

    // 宽度：取所有行中最长的一行
    let maxW = 64;
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
    const segGap = (cnLines.length > 0 && enLines.length > 0) ? 3.2 : 0;
    const h = cnH + segGap + enH + padY;

    return { w: maxW, h: Math.max(38.4, h), cnLines, enLines, cnFS, enFS };
}

/**
 * buildTransferLineFrame - 生成单条换乘线路名称框的 SVG 片段
 *
 * 框尺寸根据文字内容自适应。支持 \n 换行，CN/EN 各自多行渲染。
 *
 * @param  {Object} lineData - {color, nameCN, nameEN, textMode}
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
    const cnFS = 4.0 * SCALE;   // 换乘字号固定：中文 4 号
    const enFS = 2.0 * SCALE;   // 换乘字号固定：英文 2 号
    const lnGap = 1.0;

    const cnLines = (lineData.nameCN || '').replace(/\\n/g, '\n').split('\n');
    const enLines = (lineData.nameEN || '').replace(/\\n/g, '\n').split('\n');

    // CN 文字块总高
    const cnBlockH = cnLines.length > 0 ? cnLines.length * cnFS * lnGap : 0;
    const enBlockH = enLines.length > 0 ? enLines.length * enFS * lnGap : 0;
    const segGap = (cnLines.length > 0 && enLines.length > 0) ? 3.2 : 0;
    const blockH = cnBlockH + segGap + enBlockH;

    // CN 块起始 Y（顶部对齐，上留白 = frameH - blockH）
    const topPad = frameH - blockH;
    const cnStartY = y + topPad;
    // EN 块起始 Y
    const enStartY = cnStartY + cnBlockH + segGap;

    let svg = `<g>
    <rect x="${x}" y="${y}" width="${frameW}" height="${frameH}" rx="${rx}" ry="${rx}"
          fill="${fillColor}"/>`;

    // 「X号线」数字下沉式：左侧大数字 + 右侧两行（上行「号线」、下行「Line X」）
    const dl = getTransferDigitLayout(lineData);
    if (dl) {
        const cnStartY = y + (frameH - dl.textH) / 2;                 // 「号线」行顶（右列两行整体垂直居中）
        const enStartY = cnStartY + dl.cnFS + dl.segGap;              // 「Line X」行顶
        const digitY = cnStartY + 3;    // 大数字字形中心与右列文字块中心对齐
        const contentW = dl.digitW + dl.digitGap + dl.textColW;
        const startX = x + (frameW - contentW) / 2;      // 组水平居中
        const textX = startX + dl.digitW + dl.digitGap;  // 右列左对齐起点
        const escRest = dl.rest.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escEn = dl.enText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        svg += `
    <text x="${startX + dl.digitW / 2}" y="${digitY}" text-anchor="middle" dominant-baseline="hanging"
          font-size="${dl.bigFS}" font-family="${FONT_FAMILY}" fill="${textColor}">${dl.digits}</text>`;
        svg += `
    <text x="${textX}" y="${cnStartY}" text-anchor="start" dominant-baseline="hanging"
          font-size="${cnFS}" font-family="${FONT_FAMILY}" fill="${textColor}">${escRest}</text>`;
        svg += `
    <text x="${textX}" y="${enStartY}" text-anchor="start" dominant-baseline="hanging"
          font-size="${enFS}" font-family="${FONT_FAMILY}" fill="${textColor}">${escEn}</text>`;
        svg += `
  </g>`;
        return svg;
    }

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
 * @param  {string} [nameMode] - 可选：覆盖站名排布模式（默认 line.nameDisplayMode）
 * @param  {boolean} [narrow] - 可选：本侧开门窄面板场景；2 条换乘时单列纵向（①/②），3 条及以上每行最多 2 列（末行居中）
 * @returns {string} SVG 片段字符串
 */
function buildTransferFrames(station, cx, cy, nameIndex, isPassed, nameMode, narrow) {
    const lines = station.transferLines;
    if (!lines || lines.length === 0) return '';

    const viewBoxWidth = 2700;
    const frameGap = 6.4;
    const halfIcon = line.iconSize * SCALE / 2;
    const count = lines.length;

    // 预计算每条线路的框尺寸（各框独立宽度/高度，不再统一取最宽）
    const sizes = lines.map(ld => estimateTransferFrameSize(ld));
    const frameWs = sizes.map(s => s.w);   // 各框各自宽度
    const frameHs = sizes.map(s => s.h);   // 各框各自高度

    // 布局：本侧开门窄面板 2 条换乘时单列纵向（①/②）；其余每行最多 2 列，末行居中
    const COLS = (narrow && count === 2) ? 1 : Math.min(count, 2);
    const ROWS = Math.ceil(count / COLS);

    // 每行高度 = 该行最高框；每行宽度 = 该行各框宽度之和 + 行内间距
    const rowHeights = [];
    const rowWidths = [];
    for (let r = 0; r < ROWS; r++) {
        let maxH = 0, sumW = 0;
        for (let c = 0; c < COLS; c++) {
            const i = r * COLS + c;
            if (i < count) {
                maxH = Math.max(maxH, frameHs[i]);
                sumW += frameWs[i] + (c > 0 ? frameGap : 0);
            }
        }
        rowHeights.push(maxH);
        rowWidths.push(sumW);
    }
    const totalH = rowHeights.reduce((sum, h) => sum + h, 0) + (ROWS - 1) * frameGap;
    const totalW = Math.max(...rowWidths);  // 组宽 = 最宽那一行

    let tfX, tfY, availTop, availBottom, scaleFromBottom;
    const MARGIN = 3.2;

    switch (nameMode || line.nameDisplayMode) {
        case 'alternating': {
            const cnName = (station.name || '').trim();
            const secName = (station.secondaryName || '').trim();
            const cnSize = line.nameFontSize * SCALE;
            const secSize = cnSize / 2;

            // 奇数站(站1/3/5)文字在上方 → 框在文字上方
            // 偶数站(站2/4/6)文字在下方 → 框在文字下方
            const isAbove = nameIndex % 2 === 0;
            const hasSec = !!secName;
            const gap = hasSec ? Math.max(6.4, secSize * 0.3) : 0;
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

    // 逐行逐列生成，各框使用各自的 frameW/frameH（独立宽度、独立高度）
    let fy = tfY;
    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
        const framesInRow = Math.min(count - idx, COLS);
        const rowOffsetX = (totalW - rowWidths[r]) / 2;  // 行内居中

        let fx = tfX + rowOffsetX;  // 列 x 连续累加（各框宽度不同）
        for (let c = 0; c < framesInRow; c++) {
            const fw = frameWs[idx];
            const fh = frameHs[idx];
            svg += '\n  ' + buildTransferLineFrame(lines[idx], fx, fy, fw, fh, isPassed);
            idx++;
            fx += fw + frameGap;
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
 * @param  {boolean} isPassed - 已过段标识（保留作签名兼容，不再用于灰化箭头）
 * @returns {string} SVG g 元素字符串
 */
function buildArrowSvg(cx, cy, w, h, direction, frame, isPassed) {
    const VB_W = 50, VB_H = 23;
    const sx = w / VB_W;
    const sy = h / VB_H;
    const x = cx - w / 2;
    const y = cy - h / 2;
    // 所有状态统一使用箭头颜色，已过段不再灰化
    const arrowStroke = line.arrowColor;

    // 左行箭头（指向左 ←），带凹口块状，3 段按右→左生长
    const LEFT_PATHS = [
        "50,2 42,2 34,11.5 42,21 50,21 42,11.5 50,2",    // [0] 右
        "33,2 25,2 17,11.5 25,21 33,21 25,11.5 33,2",    // [1] 中
        "16,2 8,2 0,11.5 8,21 16,21 8,11.5 16,2"         // [2] 左（尖端）
    ];
    // 右行箭头（指向右 →），带凹口块状，3 段按左→右生长
    const RIGHT_PATHS = [
        "0,2 8,2 16,11.5 8,21 0,21 8,11.5 0,2",          // [0] 左
        "17,2 25,2 33,11.5 25,21 17,21 25,11.5 17,2",    // [1] 中
        "34,2 42,2 50,11.5 42,21 34,21 42,11.5 34,2"     // [2] 右（尖端）
    ];

    // 左行 → 使用左指路径；右行 → 使用右指路径
    const paths = direction === 'left' ? LEFT_PATHS : RIGHT_PATHS;

    // 路径已按生长方向排列，统一从 index 0 开始生长
    const FRAME_VISIBLE = [[0], [0, 1], [0, 1, 2]];

    const visible = new Set(FRAME_VISIBLE[frame]);

    let svg = `<g transform="translate(${x}, ${y}) scale(${sx}, ${sy})">`;
    for (let pi = 0; pi < 3; pi++) {
        const drawAttr = visible.has(pi)
            ? `fill="${arrowStroke}" stroke="${arrowStroke}" stroke-width="0.5" stroke-linejoin="miter"`
            : 'fill="none" stroke="none"';
        svg += `\n  <polygon ${drawAttr} points="${paths[pi]}"/>`;
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

/**
 * buildDoorGraphic - 生成对侧开门画面的车门 SVG 片段
 *
 * 车门由 doorl.svg（左门扇，圆角在左）与 doorr.svg（右门扇，180° 旋转）拼合，
 * 内联路径数据避免外部 <image> 加载失败导致车门隐形。
 * 原始两扇各 31×51（拼合后 62×51），按 doorH 等比缩放。
 *
 * @param  {number} x     - 车门左上角 X（viewBox 单位）
 * @param  {number} y     - 车门左上角 Y
 * @param  {number} doorH - 车门高度
 * @param  {number} [openAmount] - 开门进度 0(关)~1(开)，两门扇向外滑开；缺省/0 为闭合
 * @returns {string} SVG g 元素字符串
 */
function buildDoorGraphic(x, y, doorH, openAmount) {
    const s = doorH / 51;
    const leafPath = 'M5.5.5h25v50H5.5c-2.76,0-5-2.24-5-5V5.5C.5,2.74,2.74.5,5.5.5Z';
    const windowRect = '<rect x="8" y="7.54" width="15" height="20" rx="3" ry="3" fill="#000"/>';
    // 开门动画：openAmount 0(关)~1(开)，两门扇向外滑开（原始 SVG 坐标单位）
    const slide = (openAmount || 0) * 10;
    const leaf = (extraTransform) => `<g transform="${extraTransform}">
    <path d="${leafPath}" fill="#fff" stroke="#000" stroke-width="1" stroke-miterlimit="10"/>
    ${windowRect}
  </g>`;
    // 左门扇向左滑（屏幕 -slide）；右门扇在镜像组内向左滑 → 屏幕 +slide
    return `<g transform="translate(${x}, ${y}) scale(${s})">
    ${leaf(`translate(${-slide}, 0)`)}
    <g transform="translate(62,0) scale(-1,1)">
      ${leaf(`translate(${-slide}, 0)`)}
    </g>
  </g>`;
}

/**
 * buildDoorArrowSvg - 生成两门之间绿色上箭头 SVG 片段
 *
 * 本侧开门门全开后显示：箭头在两门间隙内自底向上循环移动，指示乘客由此上车。
 * 实心绿色上指箭头，局部坐标高度 12、宽度 8，中心位于 (cx, cy)。
 *
 * @param  {number} cx - 箭头中心 X（两门间隙中心）
 * @param  {number} cy - 箭头中心 Y（随行程 doorArrowProgress 自底向顶）
 * @param  {number} [opacity] - 可选：透明度 0~1（行程两端淡入淡出用）；缺省为 1
 * @returns {string} SVG g 元素字符串
 */
function buildDoorArrowSvg(cx, cy, opacity) {
    const color = '#00c853';  // 绿色（Material Green 600），深色背景上清晰
    // 局部坐标：尖端朝上，头部三角 y:-6..2，尾部杆 y:2..6
    const d = 'M0,-6 L4,2 L1.5,2 L1.5,6 L-1.5,6 L-1.5,2 L-4,2 Z';
    const op = (opacity === undefined) ? 1 : opacity;
    return `<g transform="translate(${cx}, ${cy})" opacity="${op.toFixed(2)}">
    <path d="${d}" fill="${color}"/>
  </g>`;
}

/**
 * buildProhibitionIcon - 生成禁止（禁入）图标 SVG 片段
 *
 * 经典禁止标志：红色圆环 + 红色斜杠，白色内底。
 * 用于对侧开门画面，叠在车门上表示"本侧不开门"。
 *
 * @param  {number} cx - 圆心 X
 * @param  {number} cy - 圆心 Y
 * @param  {number} r  - 半径
 * @returns {string} SVG g 元素字符串
 */
function buildProhibitionIcon(cx, cy, r) {
    const sw = Math.max(1.5, r * 0.16);
    const slash = r * 0.7;
    return `<g opacity="0.75">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#f00" stroke-width="${sw}"/>
    <line x1="${cx - slash}" y1="${cy - slash}" x2="${cx + slash}" y2="${cy + slash}" stroke="#f00" stroke-width="${sw}"/>
  </g>`;
}

/**
 * renderDoorSideDisplay - 对侧开门停站特殊画面
 *
 * 当列车停靠在非本侧开门车站时：
 *   - 线路长度缩短为 150
 *   - 仅显示当前站附近的 5 个车站
 *   - 线路分段着色（已过灰色 / 未过线路色）
 *   - 非端头站方向显示延伸线（"--"）
 *   - 左侧显示车门（doorl+doorr 拼合）+ 闪烁禁止图标，下方标注"对侧开门"
 *   - 右侧显示当前时间（HH:MM / YYYYMMDD / 星期X）
 *   - 支持左行/右行双向
 *   - 线路垂直位置固定居中（positionY=0.5），站名样式固定为横向上下交错式（alternating）
 *
 * 依赖: line, stations, currentStationIndex (全局), FONT_FAMILY (全局),
 *       VIEWBOX_HEIGHT (全局), isStationPassed()
 */
function renderDoorSideDisplay() {
    console.log('[PIDS] renderDoorSideDisplay 开始执行, 方向:', line.direction);
    try {
    const viewBoxWidth = 2700;
    const shortLength = 1080;    // 停站画面线路长度（决定车站间距，5 站时间距 270）
    const rectX = (viewBoxWidth - shortLength) / 2;
    const lineW = line.strokeWidth * SCALE; // 线路粗细（2700 坐标系）
    const lineCenterY = 0.5 * (VIEWBOX_HEIGHT - lineW) + lineW / 2; // 停站画面线路固定居中 (0.5)
    const iconSize = line.iconSize * SCALE;
    const strokeW = Math.max(3.2, iconSize / 10);
    const isLeftDir = (line.direction === 'left');

    // --- 计算要显示的 5 个车站（以当前站为中心） ---
    const N = stations.length;
    let startIdx, endIdx;
    if (N <= 5) {
        startIdx = 0;
        endIdx = N - 1;
    } else {
        startIdx = Math.max(0, currentStationIndex - 2);
        endIdx = startIdx + 4;
        if (endIdx >= N) {
            endIdx = N - 1;
            startIdx = Math.max(0, endIdx - 4);
        }
    }

    const visibleIndices = [];
    for (let i = startIdx; i <= endIdx; i++) {
        visibleIndices.push(i);
    }
    const V = visibleIndices.length;

    // 视觉位置 → 逻辑站索引（左行时反转）
    function visToIdx(vi) {
        return isLeftDir ? visibleIndices[V - 1 - vi] : visibleIndices[vi];
    }

    const firstCx = rectX;
    const lastCx = rectX + shortLength;
    const spacing = V > 1 ? (lastCx - firstCx) / (V - 1) : 0;
    const extLen = V > 1 ? spacing : 8;   // 两侧线路超出长度 = 车站间距

    // --- 端头站判定（方向感知） ---
    // 右行→: 左端头=索引0可见, 右端头=索引N-1可见
    // 左行←: 左端头=索引N-1可见, 右端头=索引0可见
    const leftTerminal  = isLeftDir ? (endIdx === N - 1) : (startIdx === 0);
    const rightTerminal = isLeftDir ? (startIdx === 0) : (endIdx === N - 1);

    // 延伸段颜色（延伸方向指向已过站→灰, 指向未过站→线路色）
    // 右行→: 左延=已过(灰), 右延=未过(线路色)
    // 左行←: 左延=未过(线路色), 右延=已过(灰)
    const leftExtColor  = isLeftDir ? line.color : '#999';
    const rightExtColor = isLeftDir ? '#999' : line.color;

    // --- 线路分段 ---
    const lineY = lineCenterY - lineW / 2; // 与 lineCenterY 一致，固定居中
    const lineH = lineW;
    let lineSvg = '';

    // 左延伸段
    if (!leftTerminal && extLen > 0) {
        const extLeftX = rectX - extLen;
        lineSvg += `\n  <rect x="${extLeftX}" y="${lineY}" width="${extLen}" height="${lineH}" fill="${leftExtColor}" rx="2"/>`;
    }

    // 站间段：逐段着色
    // 段颜色由该段在行进方向上"更早"的那个站决定
    // 右行→: 左站索引更小→更早, 检查左站 isStationPassed
    // 左行←: 右站索引更小→更早, 检查右站 isStationPassed
    for (let vi = 0; vi < V - 1; vi++) {
        const segX = firstCx + vi * spacing;
        const leftIdx = visToIdx(vi);
        const rightIdx = visToIdx(vi + 1);
        // 逻辑上索引更小的站是"更早经过"的站
        const earlierIdx = isLeftDir ? rightIdx : leftIdx;
        const segColor = isStationPassed(earlierIdx) ? '#999' : line.color;
        lineSvg += `\n  <rect x="${segX}" y="${lineY}" width="${spacing}" height="${lineH}" fill="${segColor}" rx="2"/>`;
    }

    // 右延伸段
    if (!rightTerminal && extLen > 0) {
        lineSvg += `\n  <rect x="${lastCx}" y="${lineY}" width="${extLen}" height="${lineH}" fill="${rightExtColor}" rx="2"/>`;
    }

    // 兜底：单站且无延伸时显示短线路
    if (lineSvg === '') {
        lineSvg = `<rect x="${rectX}" y="${lineY}" width="${shortLength}" height="${lineH}" fill="${line.color}" rx="2"/>`;
    }

    // --- 预计算到站时间（按逻辑索引序，与视觉方向无关） ---
    const arrivalTimes = new Array(N).fill(-1);
    {
        let cumulative = 0;
        let foundCurrent = false;
        for (let i = 0; i < N; i++) {
            if (i === currentStationIndex) {
                foundCurrent = true;
                arrivalTimes[i] = 0;
                cumulative = stations[i].timeToNext || 0;
            } else if (foundCurrent) {
                arrivalTimes[i] = cumulative;
                cumulative += stations[i].timeToNext || 0;
            }
        }
    }

    // --- 车站 ---
    let stationsSvg = '';

    for (let vi = 0; vi < V; vi++) {
        const i = visToIdx(vi);
        const station = stations[i];
        const cx = V > 1 ? firstCx + spacing * vi : (rectX + shortLength / 2);
        const isPassed = isStationPassed(i);
        const isCurrentSt = (i === currentStationIndex);

        const x = cx - iconSize / 2 + strokeW / 2;
        const y = lineCenterY - iconSize / 2 + strokeW / 2;
        const renderSize = iconSize - strokeW;

        const stationStroke = isPassed ? '#999' : line.color;
        const stationFill = isPassed ? '#f0f0f0'
            : (isCurrentSt ? (currentStationBlink ? '#FFD700' : '#fff') : '#fff');
        const stationGlow = (isCurrentSt && !isPassed) ? ` filter="url(#glow)"` : '';

        // 换乘站图标
        const isTransferStation = station.type === '换乘站'
            && station.transferLines && station.transferLines.length > 0;
        // 停站中当前站为换乘站时：保持显示换乘图标，填充底色黄色闪烁
        const isCurrentTransfer = isTransferStation && isCurrentSt && !isPassed;
        const showTransfer = isTransferStation && transferToggle && !isPassed;
        const showPassedTransfer = isTransferStation && isPassed;

        if (isCurrentTransfer) {
            stationsSvg += '\n  ' + buildTransferIcon(cx, lineCenterY, iconSize, currentStationBlink ? '#FFD700' : '#fff');
        } else if (showTransfer) {
            stationsSvg += '\n  ' + buildTransferIcon(cx, lineCenterY, iconSize);
        } else if (showPassedTransfer) {
            stationsSvg += '\n  ' + buildTransferIconGray(cx, lineCenterY, iconSize);
        } else {
            stationsSvg += `
  <rect x="${x}" y="${y}" width="${renderSize}" height="${renderSize}" rx="${renderSize / 2}" ry="${renderSize / 2}" fill="${stationFill}" stroke="${stationStroke}" stroke-width="${strokeW}"${stationGlow} />`;
            // 到站时间（未过站且非当前站）
            if (arrivalTimes[i] > 0 && !isCurrentSt) {
                const timeFontSize = Math.max(7.68, iconSize * 0.5);
                stationsSvg += `
  <text x="${cx}" y="${lineCenterY}" text-anchor="middle" dominant-baseline="central" font-size="${timeFontSize}" font-family="${FONT_FAMILY}" fill="#000">${arrivalTimes[i]}</text>`;
            }
        }

        // 站名
        const nameSvg = buildStationNameSvg(station, cx, lineCenterY, i, isPassed, isCurrentSt, 'alternating');
        if (nameSvg) stationsSvg += '\n  ' + nameSvg;

        // 换乘框
        if (isTransferStation) {
            const framesSvg = buildTransferFrames(station, cx, lineCenterY, i, isPassed, 'alternating');
            if (framesSvg) stationsSvg += '\n  ' + framesSvg;
        }
    }

    // --- 站间箭头 ---
    let arrowsSvg = '';
    const arrowW = lineW * line.arrowScaleW * 2;
    const arrowH = lineW * line.arrowScaleH;
    if (V > 1) {
        for (let si = 0; si < V - 1; si++) {
            const cx1 = firstCx + spacing * si;
            const cx2 = firstCx + spacing * (si + 1);
            const arrowCx = (cx1 + cx2) / 2;
            // 段颜色判定：取索引更小的站（逻辑上"更早经过"）
            const leftIdx = visToIdx(si);
            const rightIdx = visToIdx(si + 1);
            const earlierIdx = isLeftDir ? rightIdx : leftIdx;
            const segPassed = isStationPassed(earlierIdx);
            arrowsSvg += '\n  ' + buildArrowSvg(arrowCx, lineCenterY, arrowW, arrowH, line.direction, 2, segPassed);
        }
    }
    // 两侧延伸段（线路超出的一站间距）也显示箭头
    if (extLen > 0) {
        if (!leftTerminal) {
            arrowsSvg += '\n  ' + buildArrowSvg(firstCx - extLen / 2, lineCenterY, arrowW, arrowH, line.direction, 2, true);
        }
        if (!rightTerminal) {
            arrowsSvg += '\n  ' + buildArrowSvg(lastCx + extLen / 2, lineCenterY, arrowW, arrowH, line.direction, 2, true);
        }
    }

    // --- 左侧面板：车门 + 禁止图标 + 提示文字 ---
    // 门由 doorl/doorr 两扇拼合，静止显示；禁止图标按 currentStationBlink 闪烁
    // 车门整体上移 10，提示文字「对侧开门」放在车门下方
    const doorH = 230.4;                    // 车门高度（viewBox 单位，×6.4）
    const doorW = doorH * 62 / 51;          // 车门宽度（原始宽高比 62:51）
    const doorX = 89.98;                    // 车门左上角 X（左对齐，×6.4）
    const doorCenterY = lineCenterY - 32;   // 车门垂直中心（整体上移 32）
    const doorY = doorCenterY - doorH / 2;  // 车门左上角 Y
    const doorCx = doorX + doorW / 2;       // 车门中心 X
    const prohibitionR = 70.4;              // 禁止图标半径（×6.4）
    const doorSvg = buildDoorGraphic(doorX, doorY, doorH);
    const prohibitionSvg = currentStationBlink
        ? buildProhibitionIcon(doorCx, doorCenterY, prohibitionR)
        : '';
    // 提示文字：车门下方、与车门居中对齐，沿用站名文字颜色
    const leftColor = line.stationNameColor;
    const labelY = doorY + doorH + 38.4;    // 文字垂直中心（车门底边下方留 38.4 空隙）
    const labelText = `  <g transform="translate(${doorCx}, ${labelY})">
    <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
          font-size="38.4" font-family="${FONT_FAMILY}" fill="${leftColor}" font-weight="bold">对侧开门</text>
    <text x="0" y="32" text-anchor="middle" dominant-baseline="central"
          font-size="19.2" font-family="${FONT_FAMILY}" fill="${leftColor}">Doors open on the other side</text>
  </g>`;
    const leftPanel = doorSvg + (prohibitionSvg ? '\n  ' + prohibitionSvg : '') + '\n  ' + labelText;

    // --- 右侧面板：时间 ---
    const displayTime = getDisplayTime();
    const hhmm = formatTimeHM(displayTime);
    const yyyymmdd = `${displayTime.getFullYear()}/${String(displayTime.getMonth() + 1).padStart(2, '0')}/${String(displayTime.getDate()).padStart(2, '0')}`;
    const dayOfWeek = `星期${getDayOfWeek(displayTime)}`;

    const rightColor = line.stationNameColor;
    // 时间文字放大，外包线路色圆角描边（无色填充，位于线路显示区右侧之外）
    const rightText = `  <g transform="translate(2385.02, ${lineCenterY})">
    <rect x="-96" y="-160" width="256" height="320" rx="19.2" fill="none" stroke="${line.color}" stroke-width="6.4"/>
    <text x="32" y="-51.2" text-anchor="middle" dominant-baseline="central"
          font-size="76.8" font-family="${FONT_FAMILY}" fill="${rightColor}" font-weight="bold">${hhmm}</text>
    <text x="32" y="19.2" text-anchor="middle" dominant-baseline="central"
          font-size="32" font-family="${FONT_FAMILY}" fill="${rightColor}">${yyyymmdd}</text>
    <text x="32" y="76.8" text-anchor="middle" dominant-baseline="central"
          font-size="38.4" font-family="${FONT_FAMILY}" fill="${rightColor}">${dayOfWeek}</text>
  </g>`;

    // --- 组装 SVG ---
    const pidsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5.12" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  ${lineSvg}
  ${arrowsSvg}
  ${stationsSvg}
  ${leftPanel}
  ${rightText}
</svg>`;

    pidsLineTrack.innerHTML = pidsSvg;
    console.log('[PIDS] renderDoorSideDisplay SVG已设置, 长度:', pidsSvg.length, '方向:', line.direction, '包含车门:', pidsLineTrack.innerHTML.includes('stroke-miterlimit="10"'), '包含延伸段:', !leftTerminal || !rightTerminal);
    renderBanner();
    scheduleSave();
    } catch(e) {
        console.error('[PIDS] renderDoorSideDisplay 出错:', e.message, e.stack);
    }
}

// ========== 本侧开门停站画面 ==========

/**
 * handleThisSideStop - 进入本侧开门停站画面（幂等）
 *
 * 首次进入时复位车门开门动画与右侧面板循环，并启动对应定时器；
 * 定时器触发渲染时重复调用不做任何事。
 */
function handleThisSideStop() {
    if (stopDisplayKind === 'this') return;
    stopDisplayKind = 'this';
    thisSidePanelMode = 'station';
    doorOpenAmount = 0;
    startThisSideCycle();
    startDoorOpenAnim();
}

/**
 * handleOppositeSideStop - 进入对侧开门停站画面（幂等）
 *
 * 清理本侧开门状态；对侧开门画面自身无独立定时器（复用全局闪烁定时器）。
 */
function handleOppositeSideStop() {
    if (stopDisplayKind === 'opposite') return;
    stopDisplayKind = 'opposite';
    cleanupThisSide();
}

/**
 * handleStopDisplaysEnd - 离开停站画面时清理本侧开门状态
 */
function handleStopDisplaysEnd() {
    stopDisplayKind = null;
    cleanupThisSide();
}

/**
 * cleanupThisSide - 停止本侧开门画面定时器并复位状态
 */
function cleanupThisSide() {
    if (thisSidePanelTimer) { clearTimeout(thisSidePanelTimer); thisSidePanelTimer = null; }
    if (doorAnimTimer) { clearInterval(doorAnimTimer); doorAnimTimer = null; }
    if (doorArrowTimer) { clearInterval(doorArrowTimer); doorArrowTimer = null; }
    thisSidePanelMode = 'station';
    doorOpenAmount = 0;
    doorArrowProgress = 0;
    doorArrowActive = false;
}

/**
 * startThisSideCycle - 启动右侧面板 10s/2s 循环
 *
 * 'station'（本站/站名）显示 THIS_SIDE_STATION_MS 后切 'date'（日期），
 * 'date' 显示 THIS_SIDE_DATE_MS 后切回，用 setTimeout 链实现两种时长。
 */
function startThisSideCycle() {
    if (thisSidePanelTimer) { clearTimeout(thisSidePanelTimer); thisSidePanelTimer = null; }
    thisSidePanelMode = 'station';
    const tick = () => {
        const isStation = thisSidePanelMode === 'station';
        thisSidePanelTimer = setTimeout(() => {
            thisSidePanelMode = isStation ? 'date' : 'station';
            renderPIDSDisplay();
            tick();
        }, isStation ? THIS_SIDE_STATION_MS : THIS_SIDE_DATE_MS);
    };
    tick();
}

/**
 * startDoorOpenAnim - 启动车门开门动画
 *
 * 每 DOOR_ANIM_DELAY 步进 doorOpenAmount 直至 1（全开），随后停表（保持开门）。
 */
function startDoorOpenAnim() {
    if (doorAnimTimer) { clearInterval(doorAnimTimer); doorAnimTimer = null; }
    doorOpenAmount = 0;
    doorAnimTimer = setInterval(() => {
        doorOpenAmount = Math.min(1, doorOpenAmount + 1 / DOOR_OPEN_STEPS);
        renderPIDSDisplay();
        if (doorOpenAmount >= 1) {
            clearInterval(doorAnimTimer);
            doorAnimTimer = null;
            startDoorArrowAnim();  // 门全开 → 启动两门间绿色上箭头
        }
    }, DOOR_ANIM_DELAY);
}

/**
 * startDoorArrowAnim - 启动两门之间绿色上箭头动画
 *
 * 门全开后调用；每 DOOR_ARROW_DELAY 步进 doorArrowProgress 0→1 循环：
 * 箭头自两门间隙底部向上移动到顶部后回到底部，持续指示"由此上车"方向。
 */
function startDoorArrowAnim() {
    if (doorArrowTimer) { clearInterval(doorArrowTimer); doorArrowTimer = null; }
    doorArrowProgress = 0;
    doorArrowActive = true;
    doorArrowTimer = setInterval(() => {
        doorArrowProgress += 1 / DOOR_ARROW_STEPS;
        if (doorArrowProgress >= 1) doorArrowProgress = 0;  // 循环
        renderPIDSDisplay();
    }, DOOR_ARROW_DELAY);
}

// ========== 列车 + 站台设施渲染 ==========

/**
 * buildCoachGraphic - 生成单节车厢 SVG 片段
 *
 * 内联 coach_L/coach_M/coach_R 三个车厢图形（viewBox 61×31）的路径数据，
 * 等比缩放到指定车厢尺寸。车头形状（L=左侧圆头 / R=右侧圆头）用于区分
 * 列车两端，中间车厢为平头。
 *
 * @param  {string} shape - 'L' | 'M' | 'R'，对应 coach_L/coach_M/coach_R
 * @param  {number} x     - 车厢左上角 X
 * @param  {number} y     - 车厢左上角 Y
 * @param  {number} carW  - 车厢宽度
 * @param  {number} carH  - 车厢高度
 * @returns {string} SVG g 元素字符串
 */
function buildCoachGraphic(shape, x, y, carW, carH) {
    const s = carW / 61;
    const bodyAttrs = 'fill="#fff" fill-opacity="0.5" stroke="#000" stroke-width="1" stroke-miterlimit="10"';
    let inner;
    if (shape === 'L') {
        inner = `<path ${bodyAttrs} d="M30.5.5h30v30H.5C.5,13.9,13.9.5,30.5.5Z"/>`;
    } else if (shape === 'R') {
        inner = `<path ${bodyAttrs} d="M60.5,30.5H.5V.5h30c16.6,0,30,13.4,30,30h0Z"/>`;
    } else {
        inner = `<rect ${bodyAttrs} x="0.5" y="0.5" width="60" height="30"/>`;
    }
    return `<g transform="translate(${x}, ${y}) scale(${s})">
    ${inner}
  </g>`;
}

/**
 * buildTrainGraphic - 生成列车编组 SVG 片段
 *
 * 车厢按列表顺序排列，第 1 行（cars[0]）为列车前端；车厢号可重复，仅作标记：
 *   - 右行→：前端在右端，鼻朝右（coach_R），车厢向左延伸
 *   - 左行←：前端在左端，鼻朝左（coach_L），车厢向右延伸
 * 车头图案按车头出现顺序（前端→末端）交替朝向：第 1、3、5…个车头随运行方向，
 * 第 2、4、6…个车头反向 —— 相邻两个车头相背成对（一组车头车尾）；
 * 未勾选车头的车厢使用 coach_M 中间车。
 * 车厢号显示在车厢中央，车身底色白半透明、黑描边。
 *
 * @param  {Array}  cars     - 车厢数组 [{number, isHead}]
 * @param  {number} centerX  - 列车水平中心 X
 * @param  {number} bottomY  - 列车底边 Y（紧贴轨道线）
 * @param  {number} maxWidth - 可用最大宽度（超宽时整体缩小车高）
 * @returns {string} SVG 片段字符串
 */
function buildTrainGraphic(cars, centerX, bottomY, maxWidth) {
    const N = cars.length;
    if (N === 0) return '';
    const gap = 9.6;            // 车厢间隙（×6.4）
    const unit = 61 / 31;       // 车厢宽高比
    let carH = 89.6;
    let carW = carH * unit;
    let totalW = N * carW + (N - 1) * gap;
    // 宽度超限 → 按可用宽度收缩车高
    if (totalW > maxWidth) {
        carH = (maxWidth - (N - 1) * gap) / (N * unit);
        carW = carH * unit;
        totalW = N * carW + (N - 1) * gap;
    }
    const startX = centerX - totalW / 2;
    const isRightDir = (line.direction === 'right');

    // 按逻辑顺序（前端→末端）给车头编号：奇数号随运行方向、偶数号反向
    const headOrdinals = new Array(N).fill(0);
    let headCount = 0;
    for (let li = 0; li < N; li++) {
        if (cars[li].isHead) headOrdinals[li] = ++headCount;
    }

    let svg = '';
    for (let i = 0; i < N; i++) {
        // 视觉索引 i（左→右）→ 逻辑索引（cars[0] 为前端，cars[N-1] 为末端）
        const logicalIndex = isRightDir ? (N - 1 - i) : i;
        const car = cars[logicalIndex];
        const x = startX + i * (carW + gap);
        // 车头形状：按车头编号交替朝向（奇数随方向、偶数反向）；非车头用中间车
        let shape;
        if (!car.isHead) {
            shape = 'M';
        } else {
            const odd = (headOrdinals[logicalIndex] % 2 === 1);
            shape = odd ? (isRightDir ? 'R' : 'L') : (isRightDir ? 'L' : 'R');
        }
        svg += '\n  ' + buildCoachGraphic(shape, x, bottomY - carH, carW, carH);
        // 车厢号
        svg += `\n  <text x="${x + carW / 2}" y="${bottomY - carH / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(38.4, carH * 0.5)}" font-family="${FONT_FAMILY}" fill="#000">${car.number}</text>`;
    }
    return svg;
}


/**
 * buildStationFacilitySvg - 生成「列车 + 轨道 + 站厅」站台设施 SVG 片段
 *
 * 轨道为深灰色水平线，始终位于列车下方；轨道垂直位置由车站类型决定：
 *   - 地下站（isUnderground=true）：轨道在显示区底部
 *   - 地上站（isUnderground=false）：轨道在显示区上部
 * 站厅为细黑线，垂直位置随车站类型独立设定：
 *   - 地下站：站厅在上侧(61)
 *   - 地上站：站厅在下侧(329.8)
 * 列车紧贴轨道上方，水平居中于中部面板（x 576~2196）。
 *
 * @param  {Object} curSt - 当前车站对象（含 isUnderground）
 * @returns {string} SVG 片段字符串
 */
function buildStationFacilitySvg(curSt) {
    const panelX = 576;
    const panelW = 1620;
    const panelCenterX = panelX + panelW / 2;

    // 轨道垂直位置：地下站→底部(384)，地上站→上部(115.2)
    const railY = curSt.isUnderground ? 384 : 150;
    const railColor = line.color;   // 轨道颜色 = 线路色（随控制面板「线路颜色」同步）
    // 站厅细黑线垂直位置：地下站→上侧(61)，地上站→下侧(329.8)，可独立调整
    const hallY = curSt.isUnderground ? 100 : 320;
    const hallColor = '#000';   // 黑色站厅线
    const hallH = 3.2;          // 细黑线高度

    let svg = `  <rect x="${panelX}" y="${railY}" width="${panelW}" height="9.6" fill="${railColor}"/>`;
    svg += `\n  <rect x="${panelX}" y="${hallY}" width="${panelW}" height="${hallH}" fill="${hallColor}"/>`;

    // 列车（底边紧贴轨道顶部，水平居中）
    const cars = (line.trainCars && line.trainCars.length > 0)
        ? line.trainCars.slice()
        : CONFIG.defaultTrainCars.map(c => ({ ...c }));
    svg += buildTrainGraphic(cars, panelCenterX, railY, panelW - 25.6);

    return svg;
}

/**
 * renderThisSideDisplay - 本侧开门停站画面
 *
 * 布局（viewBox 300×69.5）：
 *   - 左侧：车门开门动画 + 「本侧开门」提示文字
 *   - 中部：列车 + 轨道（轨道位置随车站地上/地下类型变化）
 *   - 右侧：循环面板 —— 10s「本站/站名」↔ 2s 日期；
 *           本站为换乘站时在「本站」上方叠加换乘线路框
 *
 * 依赖: line, stations, currentStationIndex, doorOpenAmount,
 *       thisSidePanelMode (全局), FONT_FAMILY, VIEWBOX_HEIGHT
 */
function renderThisSideDisplay() {
    console.log('[PIDS] renderThisSideDisplay 开始执行, 站名:', stations[currentStationIndex] && stations[currentStationIndex].name);
    try {
    const viewBoxWidth = 2700;
    const lineW = line.strokeWidth * SCALE; // 线路粗细（2700 坐标系）
    const lineCenterY = 0.5 * (VIEWBOX_HEIGHT - lineW) + lineW / 2;
    const curSt = stations[currentStationIndex];
    const rightColor = line.stationNameColor;

    // --- 左侧面板：开门动画 + 本侧开门提示 ---
    const doorH = 230.4;                    // 车门高度（viewBox 单位，×6.4）
    const doorW = doorH * 62 / 51;          // 车门宽度（原始宽高比 62:51）
    const doorX = 89.98;                    // 车门左上角 X（左对齐，×6.4）
    const doorCenterY = lineCenterY - 32;   // 车门垂直中心（与对侧开门一致）
    const doorY = doorCenterY - doorH / 2;  // 车门左上角 Y
    const doorCx = doorX + doorW / 2;       // 车门中心 X
    const doorSvg = buildDoorGraphic(doorX, doorY, doorH, doorOpenAmount);
    // 门全开后：两门之间绿色上箭头自底向顶循环运动（缓入缓出 + 两端淡入淡出）
    let arrowSvg = '';
    if (doorArrowActive) {
        const arrowTravel = doorH - 76.8;               // 76.8 = 箭头自身高度（viewBox 单位，×6.4）
        const arrowBottom = doorY + doorH - 38.4;       // 行程底：箭头贴门底边
        // 缓动：smoothstep（p²(3-2p)）缓入缓出，起点加速、终点减速
        const raw = doorArrowProgress;
        const eased = raw * raw * (3 - 2 * raw);
        const arrowCy = arrowBottom - eased * arrowTravel;
        // 淡入淡出：起点(底)淡入、终点(顶)淡出，中部全亮（两端各占 15% 行程）
        const FADE = 0.15;
        const arrowOp = raw < FADE ? raw / FADE : (raw > 1 - FADE ? (1 - raw) / FADE : 1);
        arrowSvg = '\n  ' + buildDoorArrowSvg(doorCx, arrowCy, arrowOp);
    }
    const leftColor = line.stationNameColor;
    const labelY = doorY + doorH + 38.4;    // 文字垂直中心（车门底边下方留 38.4 空隙）
    const labelText = `  <g transform="translate(${doorCx}, ${labelY})">
    <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
          font-size="38.4" font-family="${FONT_FAMILY}" fill="${leftColor}" font-weight="bold">本侧开门</text>
    <text x="0" y="32" text-anchor="middle" dominant-baseline="central"
          font-size="19.2" font-family="${FONT_FAMILY}" fill="${leftColor}">Doors open on this side</text>
  </g>`;
    const leftPanel = doorSvg + arrowSvg + '\n  ' + labelText;

    // --- 中部：列车 + 轨道（轨道位置随车站地上/地下类型变化） ---
    const midPanel = buildStationFacilitySvg(curSt);

    // --- 右侧面板：10s 本站/站名 ↔ 2s 日期 循环 ---
    // 外框与对侧开门时间面板一致：线路色圆角描边、无色填充，固定 40×50
    const rightX = 2385.02;  // 与对侧开门时间面板 translate(2385.02) 对齐（×6.4）
    const displayTime = getDisplayTime();
    const yyyymmdd = `${displayTime.getFullYear()}/${String(displayTime.getMonth() + 1).padStart(2, '0')}/${String(displayTime.getDate()).padStart(2, '0')}`;
    const dayOfWeek = `星期${getDayOfWeek(displayTime)}`;
    const stationName = curSt.name || '';

    const frameRect = `    <rect x="-96" y="-160" width="256" height="320" rx="19.2" fill="none" stroke="${line.color}" stroke-width="6.4"/>`;

    let rightPanel = '';
    if (thisSidePanelMode === 'date') {
        rightPanel = `  <g transform="translate(${rightX}, ${lineCenterY})">
    ${frameRect}
    <text x="32" y="-19.2" text-anchor="middle" dominant-baseline="central" font-size="38.4" font-family="${FONT_FAMILY}" fill="${rightColor}" font-weight="bold">${yyyymmdd}</text>
    <text x="32" y="25.6" text-anchor="middle" dominant-baseline="central" font-size="25.6" font-family="${FONT_FAMILY}" fill="${rightColor}">${dayOfWeek}</text>
  </g>`;
    } else {
        let content = `  <g transform="translate(${rightX}, ${lineCenterY})">
    ${frameRect}
    <text x="32" y="-25.6" text-anchor="middle" dominant-baseline="central" font-size="51.2" font-family="${FONT_FAMILY}" fill="${rightColor}" font-weight="bold">本站</text>
    <text x="32" y="32" text-anchor="middle" dominant-baseline="central" font-size="32" font-family="${FONT_FAMILY}" fill="${rightColor}">${stationName}</text>
  </g>`;
        // 换乘站：在「本站」上方添加换乘线路框
        // buildTransferFrames 的 'below' 模式 = 框在站点/文字上方
        const isTransferStation = curSt.type === '换乘站'
            && curSt.transferLines && curSt.transferLines.length > 0;
        if (isTransferStation) {
            const halfIcon = line.iconSize * SCALE / 2;
            const textTop = lineCenterY - 25.6 - 51.2 / 2;  // 「本站」文字顶部（central 基线，×6.4）
            const synthCy = textTop - 12.8 + halfIcon + TEXT_PAD;  // 框底边 = textTop - 12.8
            // narrow=true：本侧开门窄面板，2 条换乘单列纵向（①/②），3 条及以上回 2 列网格（末行居中）
            const framesSvg = buildTransferFrames(curSt, rightX, synthCy, 0, false, 'below', true);
            if (framesSvg) content = framesSvg + '\n  ' + content;
        }
        rightPanel = content;
    }

    // --- 组装 SVG ---
    const pidsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;">
  ${leftPanel}
  ${midPanel}
  ${rightPanel}
</svg>`;

    pidsLineTrack.innerHTML = pidsSvg;
    console.log('[PIDS] renderThisSideDisplay SVG已设置, 长度:', pidsSvg.length, '面板模式:', thisSidePanelMode, '开门度:', doorOpenAmount.toFixed(2));
    renderBanner();
    scheduleSave();
    } catch(e) {
        console.error('[PIDS] renderThisSideDisplay 出错:', e.message, e.stack);
    }
}

function renderPIDSDisplay() {
    // 停站中 → 按车门朝向显示开门特殊画面（对侧开门 / 本侧开门）
    if (!isDeparted && currentStationIndex >= 0 && currentStationIndex < stations.length) {
        const curSt = stations[currentStationIndex];
        if (curSt.doorSide === false) {
            handleOppositeSideStop();
            renderDoorSideDisplay();
            return;
        }
        handleThisSideStop();
        renderThisSideDisplay();
        return;
    }
    // 离开停站画面 → 清理本侧开门状态（定时器、动画进度）
    handleStopDisplaysEnd();

    const viewBoxWidth = 2700;
    const LINE_EXTENSION = isDeparted ? 0 : 180;
    const lineLen = line.length * viewBoxWidth;
    const rectX = (viewBoxWidth - lineLen) / 2;
    const lineStartX = rectX - LINE_EXTENSION;
    const lineEndX = rectX + lineLen + LINE_EXTENSION;
    const lineW = line.strokeWidth * SCALE; // 线路粗细（2700 坐标系）
    const lineCenterY = getLineY() + lineW / 2;

    // 站点图标在 viewBox 中的尺寸（由控制面板全局设置）
    const iconSize = line.iconSize * SCALE;
    const strokeW = Math.max(3.2, iconSize / 10);

    // 构建站点图标 + 站名 SVG
    let stationsSvg = '';
    let currentCx = null;  // 当前站 X 坐标（用于线路分段）
    if (stations.length > 0) {
        // 确定视觉首末站（左行←：站N-1在最左；右行→：站0在最左）
        const visualFirstIdx = line.direction === 'left' ? stations.length - 1 : 0;
        const visualLastIdx = line.direction === 'left' ? 0 : stations.length - 1;

        // 起终点放在线路端头
        let firstCx = rectX;
        let lastCx = rectX + lineLen;

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
                : rectX + lineLen / 2;
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
                    const timeFontSize = Math.max(7.68, iconSize * 0.5);
                    const timeFill = isCurrent ? '#fff' : '#000';
                    stationsSvg += `
  <text x="${cx}" y="${lineCenterY}" text-anchor="middle" dominant-baseline="central" font-size="${timeFontSize}" font-family="${FONT_FAMILY}" fill="${timeFill}">${arrivalTime}</text>`;
                }
            }

            // 站名文字（已过站用灰色）
            const nameSvg = buildStationNameSvg(station, cx, lineCenterY, i, isPassed, isCurrent);
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
                const arrowW = lineW * line.arrowScaleW;
                const arrowH = lineW * line.arrowScaleH;

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
        const passedStart = isLeftDir ? currentCx : lineStartX;
        const passedEnd   = isLeftDir ? lineEndX : currentCx;
        const upcomingStart = isLeftDir ? lineStartX : currentCx;
        const upcomingEnd   = isLeftDir ? currentCx : lineEndX;

        // 已过段（灰色）
        if (passedEnd > passedStart) {
            lineSvg += `<rect x="${passedStart}" y="${getLineY()}" width="${passedEnd - passedStart}" height="${lineW}" fill="#999" rx="0"/>`;
        }
        // 未过段（线路色）
        if (upcomingEnd > upcomingStart) {
            lineSvg += `\n  <rect x="${upcomingStart}" y="${getLineY()}" width="${upcomingEnd - upcomingStart}" height="${lineW}" fill="${line.color}" rx="0"/>`;
        }
    } else {
        // 无当前站 → 全彩色
        lineSvg = `<rect x="${lineStartX}" y="${getLineY()}" width="${lineEndX - lineStartX}" height="${lineW}" fill="${line.color}" rx="2"/>`;
    }

    const pidsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5.12" result="blur" />
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
    console.log('[PIDS] ⚠️ renderPIDSDisplay 末尾设置了全幅SVG（不应该在停站对侧开门时执行到此处）');
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
        transferLines: [],  // 换乘线路列表 [{color, nameCN, nameEN, textMode}]
        doorSide: true,     // 是否本侧开门（false = 对侧开门）
        isUnderground: false // 是否地下站（false = 地上站，true = 地下站）
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

    // 本侧开门复选框
    const doorCheck = document.createElement('label');
    doorCheck.className = 'station-door-check';
    doorCheck.innerHTML = `<input type="checkbox" data-station-id="${station.id}" ${station.doorSide !== false ? 'checked' : ''}>本侧开门`;
    doorCheck.querySelector('input').addEventListener('change', (e) => {
        station.doorSide = e.target.checked;
        renderPIDSDisplay();
        scheduleSave();
    });
    // 插入到换乘按钮之后
    addTransferBtn.insertAdjacentElement('afterend', doorCheck);

    // 地上站 / 地下站选择
    const groundSelect = document.createElement('select');
    groundSelect.className = 'station-ground-select';
    groundSelect.dataset.stationId = station.id;
    groundSelect.title = '车站类型（影响轨道位置）';
    const optAbove = document.createElement('option');
    optAbove.value = 'above';
    optAbove.textContent = '地上站';
    const optUnder = document.createElement('option');
    optUnder.value = 'under';
    optUnder.textContent = '地下站';
    groundSelect.appendChild(optAbove);
    groundSelect.appendChild(optUnder);
    groundSelect.value = station.isUnderground ? 'under' : 'above';
    groundSelect.addEventListener('change', (e) => {
        station.isUnderground = (e.target.value === 'under');
        renderPIDSDisplay();
        scheduleSave();
    });
    // 插入到本侧开门复选框之后
    doorCheck.insertAdjacentElement('afterend', groundSelect);

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
        textMode: 'light'
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

// ========== 列车车厢管理 ==========

/**
 * renderTrainCarList - 重建列车车厢编辑列表 DOM
 *
 * 保持列表顺序（第 1 行 = 列车前端），每行包含：
 * 车厢号输入、是否为车头复选框、删除按钮。
 *
 * 依赖: line.trainCars (全局), trainCarList (全局 DOM 引用)
 */
function renderTrainCarList() {
    if (!trainCarList) return;
    // 不按车厢号排序：车厢号可重复，仅作标记；列表顺序即列车顺序
    trainCarList.innerHTML = '';
    line.trainCars.forEach((car, index) => {
        trainCarList.appendChild(createTrainCarRow(car, index));
    });
}

/**
 * createTrainCarRow - 生成单节车厢编辑行 DOM
 *
 * @param  {Object}  car   - 车厢对象 {number, isHead}
 * @param  {number}  index - 车厢在编组中的索引（用于删除定位）
 * @returns {HTMLElement} 车厢编辑行 DOM 元素
 */
function createTrainCarRow(car, index) {
    const row = document.createElement('div');
    row.className = 'train-car-row';

    // 车厢号输入
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'train-car-num-input';
    numInput.min = '1';
    numInput.max = '99';
    numInput.value = car.number;
    numInput.title = '车厢号（可重复，仅作标记）';
    numInput.addEventListener('change', () => {
        car.number = parseInt(numInput.value, 10) || car.number;
        renderTrainCarList();
        renderPIDSDisplay();
        scheduleSave();
    });
    row.appendChild(numInput);

    // 是否为车头复选框
    const headLabel = document.createElement('label');
    headLabel.className = 'train-car-head-check';
    headLabel.title = '勾选后该车厢使用车头图案';
    const headCheck = document.createElement('input');
    headCheck.type = 'checkbox';
    headCheck.checked = !!car.isHead;
    headCheck.addEventListener('change', () => {
        car.isHead = headCheck.checked;
        renderPIDSDisplay();
        scheduleSave();
    });
    headLabel.appendChild(headCheck);
    headLabel.appendChild(document.createTextNode('车头'));
    row.appendChild(headLabel);

    // 删除按钮
    const delBtn = document.createElement('button');
    delBtn.className = 'train-car-del-btn';
    delBtn.textContent = '✕';
    delBtn.title = '删除该车厢';
    delBtn.addEventListener('click', () => {
        removeTrainCar(index);
    });
    row.appendChild(delBtn);

    return row;
}

/**
 * addTrainCar - 添加一节车厢
 *
 * 新车厢号取当前最大车厢号 +1，默认非车头。
 * 添加后重建列表并重新渲染。
 */
function addTrainCar() {
    const maxNumber = line.trainCars.reduce((max, c) => Math.max(max, c.number || 0), 0);
    line.trainCars.push({ number: maxNumber + 1, isHead: false });
    renderTrainCarList();
    renderPIDSDisplay();
    scheduleSave();
}

/**
 * removeTrainCar - 删除一节车厢
 *
 * 至少保留 1 节车厢，删除后重建列表并重新渲染。
 *
 * @param {number} index - 车厢在 line.trainCars 中的索引
 */
function removeTrainCar(index) {
    if (line.trainCars.length <= 1) return;
    line.trainCars.splice(index, 1);
    renderTrainCarList();
    renderPIDSDisplay();
    scheduleSave();
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
    line.trainCars = CONFIG.defaultTrainCars.map(c => ({ ...c }));
    delete line.trainFormation;  // 清除旧版编组字符串残留，避免序列化
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
    lengthValue.textContent = Math.round(line.length * 100) + '%';
    strokeInput.value = line.strokeWidth;
    strokeValue.textContent = line.strokeWidth;
    positionInput.value = line.positionY;
    positionValue.textContent = line.positionY.toFixed(2);
    iconSizeInput.value = line.iconSize;
    iconSizeValue.textContent = line.iconSize;
    nameModeSelect.value = line.nameDisplayMode;
    nameFontSizeInput.value = line.nameFontSize;
    nameFontSizeValue.textContent = line.nameFontSize;
    renderTrainCarList();
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
    line.length = parseFloat(e.target.value);
    lengthValue.textContent = Math.round(line.length * 100) + '%';
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

addTrainCarBtn.addEventListener('click', addTrainCar);

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
lengthValue.textContent = Math.round(line.length * 100) + '%';
strokeInput.value = line.strokeWidth;
strokeValue.textContent = line.strokeWidth;
positionInput.value = line.positionY;
positionValue.textContent = line.positionY.toFixed(2);
iconSizeInput.value = line.iconSize;
iconSizeValue.textContent = line.iconSize;
nameModeSelect.value = line.nameDisplayMode;
nameFontSizeInput.value = line.nameFontSize;
nameFontSizeValue.textContent = line.nameFontSize;
renderTrainCarList();
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
    buildDoorGraphic,
    buildProhibitionIcon,
    buildDoorArrowSvg,
    buildTransferLineFrame,
    buildTransferFrames,
    buildArrowSvg,
    buildCoachGraphic,
    buildTrainGraphic,
    buildStationFacilitySvg,
    renderTrainCarList,
    addTrainCar,
    removeTrainCar,
    migrateTrainCars,
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
