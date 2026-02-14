/**
 * 散歩ビンゴ - メインアプリケーション
 *
 * @file app.js
 * @description 散歩中に見つけたものでビンゴを楽しむWebアプリのメインロジック
 *
 * 主な仕様:
 *   - 5x5のビンゴカード生成（中央はフリーマス）
 *   - data/items.txt から項目を読み込み、ランダムに24個を選出
 *   - 「リロール」で項目をシャッフルして再配置
 *   - 「開始」でカードを確定し、マスのタップを有効化
 *   - マスをタップすると◯マークをトグル
 *   - 行・列・対角線のビンゴ判定とライン数カウント
 *
 * 制限事項:
 *   - items.txt の読み込みに失敗した場合はフォールバック項目を使用
 *   - ビンゴカードは5x5固定（25マス、中央フリー）
 */

/* ========================================
   定数定義
   ======================================== */

/** @type {number} ビンゴカードのサイズ（行・列数） */
const GRID_SIZE = 5;

/** @type {number} ビンゴカードの総マス数 */
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

/** @type {number} フリーマスのインデックス（中央） */
const FREE_CELL_INDEX = Math.floor(TOTAL_CELLS / 2);

/** @type {number} カードに必要な項目数（フリーマスを除く） */
const REQUIRED_ITEMS = TOTAL_CELLS - 1;

/** @type {string} フリーマスの表示テキスト */
const FREE_CELL_TEXT = "FREE";

/** @type {string} 項目データファイルのパス */
const ITEMS_FILE_PATH = "data/items.txt";

/**
 * @type {string[]} フォールバック用のデフォルト項目リスト
 * @description items.txt の読み込みに失敗した場合に使用
 */
const FALLBACK_ITEMS = [
  "赤い花", "白い猫", "自動販売機", "郵便ポスト", "鳥の鳴き声",
  "ベンチ", "石の階段", "落ち葉", "電柱", "雲の形",
  "犬の散歩", "自転車", "水たまり", "蝶々", "看板",
  "煙突", "橋", "鉄塔", "紫陽花", "タンポポ",
  "カラス", "すずめ", "消火栓", "マンホール", "公園の遊具",
  "木の実", "苔", "蜘蛛の巣", "風見鶏", "噴水",
  "時計台", "銅像", "鯉のぼり", "猫じゃらし", "石垣",
  "トンネル", "踏切", "川", "池", "畑",
];

/* ========================================
   アプリケーション状態
   ======================================== */

/**
 * @typedef {Object} AppState
 * @property {string[]} allItems - 読み込んだ全項目リスト
 * @property {string[]} currentItems - 現在カードに表示されている項目（25マス分）
 * @property {boolean[]} markedCells - 各マスのマーク状態
 * @property {boolean} isStarted - ゲームが開始されたかどうか
 * @property {Set<string>} completedLines - 完成済みラインのキー一覧
 */

/** @type {AppState} アプリケーションの現在の状態 */
const appState = {
  allItems: [],
  currentItems: [],
  markedCells: new Array(TOTAL_CELLS).fill(false),
  isStarted: false,
  completedLines: new Set(),
};

/* ========================================
   DOM要素の参照
   ======================================== */

/** @type {HTMLElement} ビンゴカードのコンテナ要素 */
const bingoCardElement = document.getElementById("bingoCard");

/** @type {HTMLButtonElement} リロールボタン */
const rerollButton = document.getElementById("rerollButton");

/** @type {HTMLButtonElement} 開始ボタン */
const startButton = document.getElementById("startButton");

/** @type {HTMLElement} ライン数の表示要素 */
const lineCountValueElement = document.getElementById("lineCountValue");

/** @type {HTMLElement} ステータスメッセージの表示要素 */
const statusMessageElement = document.getElementById("statusMessage");

/* ========================================
   項目データの読み込み
   ======================================== */

/**
 * items.txt から項目データを読み込む
 *
 * @async
 * @returns {Promise<string[]>} 項目の配列
 * @description ファイルの読み込みに失敗した場合はフォールバック項目を返す
 */
async function loadItems() {
  try {
    const response = await fetch(ITEMS_FILE_PATH);

    if (!response.ok) {
      throw new Error(
        `項目ファイルの読み込みに失敗しました: ${ITEMS_FILE_PATH} (HTTP ${response.status})`
      );
    }

    const text = await response.text();

    /** @type {string[]} 空行を除外した項目リスト */
    const items = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (items.length < REQUIRED_ITEMS) {
      console.warn(
        `loadItems: 項目数が不足しています（必要: ${REQUIRED_ITEMS}、取得: ${items.length}）。フォールバック項目を使用します。`
      );
      return FALLBACK_ITEMS;
    }

    return items;
  } catch (error) {
    console.warn(
      `loadItems: ${error.message} フォールバック項目を使用します。`
    );
    return FALLBACK_ITEMS;
  }
}

/* ========================================
   ユーティリティ関数
   ======================================== */

/**
 * 配列をシャッフルする（Fisher-Yatesアルゴリズム）
 *
 * @param {any[]} array - シャッフル対象の配列
 * @returns {any[]} シャッフルされた新しい配列（元の配列は変更しない）
 */
function shuffleArray(array) {
  /** @type {any[]} 元の配列のコピー */
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    /** @type {number} ランダムなインデックス */
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
  }

  return shuffled;
}

/**
 * ランダムに指定個数の項目を選出する
 *
 * @param {string[]} items - 全項目リスト
 * @param {number} count - 選出する個数
 * @returns {string[]} ランダムに選ばれた項目の配列
 */
function pickRandomItems(items, count) {
  const shuffled = shuffleArray(items);
  return shuffled.slice(0, count);
}

/* ========================================
   ビンゴカードの生成・描画
   ======================================== */

/**
 * 新しいビンゴカードの項目を生成する
 *
 * @description 全項目からランダムに24個を選び、中央にFREEマスを配置
 * @returns {string[]} 25マス分の項目配列
 */
function generateCardItems() {
  /** @type {string[]} ランダムに選ばれた24項目 */
  const selectedItems = pickRandomItems(appState.allItems, REQUIRED_ITEMS);

  /** @type {string[]} 中央にフリーマスを挿入した25項目 */
  const cardItems = [
    ...selectedItems.slice(0, FREE_CELL_INDEX),
    FREE_CELL_TEXT,
    ...selectedItems.slice(FREE_CELL_INDEX),
  ];

  return cardItems;
}

/**
 * ビンゴカードをDOMに描画する
 *
 * @description appState.currentItems をもとに5x5のグリッドを生成
 */
function renderCard() {
  bingoCardElement.innerHTML = "";

  appState.currentItems.forEach((itemText, cellIndex) => {
    /** @type {HTMLDivElement} ビンゴセル要素 */
    const cellElement = document.createElement("div");
    cellElement.classList.add("bingoCell");
    cellElement.textContent = itemText;
    cellElement.dataset.index = cellIndex;

    /** フリーマスの設定 */
    if (cellIndex === FREE_CELL_INDEX) {
      cellElement.classList.add("bingoCell--free");
    }

    /** マーク状態の反映 */
    if (appState.markedCells[cellIndex]) {
      cellElement.classList.add("bingoCell--marked");
    }

    /** 未開始時はタップ無効の見た目にする */
    if (!appState.isStarted) {
      cellElement.classList.add("bingoCell--disabled");
    }

    /** セルクリック（タップ）イベント */
    cellElement.addEventListener("click", () => handleCellClick(cellIndex));

    bingoCardElement.appendChild(cellElement);
  });

  /** ビンゴ済みラインのハイライトを更新 */
  updateBingoHighlight();
}

/* ========================================
   セルのタップ処理
   ======================================== */

/**
 * ビンゴセルがクリック（タップ）された時の処理
 *
 * @param {number} cellIndex - クリックされたセルのインデックス (0-24)
 * @description ゲーム未開始時やフリーマスはタップ無効
 */
function handleCellClick(cellIndex) {
  /** ゲーム未開始の場合は何もしない */
  if (!appState.isStarted) {
    return;
  }

  /** フリーマスはタップ不可（常にマーク済み） */
  if (cellIndex === FREE_CELL_INDEX) {
    return;
  }

  /** マーク状態をトグル */
  appState.markedCells[cellIndex] = !appState.markedCells[cellIndex];

  /** カードを再描画 */
  renderCard();

  /** ライン数を更新 */
  updateLineCount();
}

/* ========================================
   ビンゴ判定
   ======================================== */

/**
 * 全ビンゴラインの定義を取得する
 *
 * @returns {Object[]} ラインの配列。各ラインは { key: string, cells: number[] }
 * @description 5行 + 5列 + 2対角線 = 合計12ライン
 */
function getAllLines() {
  /** @type {Object[]} 全ラインの定義 */
  const lines = [];

  /** 行（横方向）のライン: row-0 ～ row-4 */
  for (let row = 0; row < GRID_SIZE; row++) {
    /** @type {number[]} この行に含まれるセルインデックス */
    const cells = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      cells.push(row * GRID_SIZE + col);
    }
    lines.push({ key: `row-${row}`, cells });
  }

  /** 列（縦方向）のライン: col-0 ～ col-4 */
  for (let col = 0; col < GRID_SIZE; col++) {
    /** @type {number[]} この列に含まれるセルインデックス */
    const cells = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      cells.push(row * GRID_SIZE + col);
    }
    lines.push({ key: `col-${col}`, cells });
  }

  /** 対角線（左上→右下）: diag-0 */
  {
    /** @type {number[]} 対角線に含まれるセルインデックス */
    const cells = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      cells.push(i * GRID_SIZE + i);
    }
    lines.push({ key: "diag-0", cells });
  }

  /** 対角線（右上→左下）: diag-1 */
  {
    /** @type {number[]} 対角線に含まれるセルインデックス */
    const cells = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      cells.push(i * GRID_SIZE + (GRID_SIZE - 1 - i));
    }
    lines.push({ key: "diag-1", cells });
  }

  return lines;
}

/**
 * 完成したビンゴラインの数を計算する
 *
 * @returns {number} 完成したライン数
 */
function countCompletedLines() {
  /** @type {Object[]} 全ラインの定義 */
  const allLines = getAllLines();

  /** @type {Set<string>} 新たに完成したラインのキー */
  const newCompletedLines = new Set();

  /** @type {number} 完成ライン数 */
  let completedCount = 0;

  allLines.forEach((line) => {
    /** @type {boolean} このラインの全セルがマーク済みかどうか */
    const isCompleted = line.cells.every(
      (cellIndex) => appState.markedCells[cellIndex]
    );

    if (isCompleted) {
      completedCount++;
      newCompletedLines.add(line.key);
    }
  });

  appState.completedLines = newCompletedLines;
  return completedCount;
}

/**
 * ビンゴ達成ラインのセルにハイライトを適用する
 */
function updateBingoHighlight() {
  /** @type {Object[]} 全ラインの定義 */
  const allLines = getAllLines();

  allLines.forEach((line) => {
    if (appState.completedLines.has(line.key)) {
      line.cells.forEach((cellIndex) => {
        /** @type {HTMLElement|null} 対象セルのDOM要素 */
        const cellElement = bingoCardElement.querySelector(
          `[data-index="${cellIndex}"]`
        );
        if (cellElement) {
          cellElement.classList.add("bingoCell--bingo");
        }
      });
    }
  });
}

/**
 * ライン数の表示を更新する
 */
function updateLineCount() {
  /** @type {number} 完成ライン数 */
  const count = countCompletedLines();
  lineCountValueElement.textContent = count;

  /** ビンゴ達成時のメッセージ更新 */
  if (count > 0) {
    statusMessageElement.textContent = `🎉 ${count}ライン達成！すごい！`;
  } else {
    statusMessageElement.textContent = "マスをタップして◯をつけよう！";
  }

  /** カードを再描画してハイライトを反映 */
  renderCard();
}

/* ========================================
   ボタン操作
   ======================================== */

/**
 * リロールボタンの処理
 *
 * @description カード項目をランダムに入れ替える（ゲーム未開始時のみ有効）
 */
function handleReroll() {
  if (appState.isStarted) {
    return;
  }

  /** 新しい項目を生成 */
  appState.currentItems = generateCardItems();

  /** マーク状態をリセット（フリーマスは未マーク） */
  appState.markedCells = new Array(TOTAL_CELLS).fill(false);

  /** シャッフルアニメーション付きで再描画 */
  renderCard();
  addShuffleAnimation();

  /** ライン数をリセット */
  appState.completedLines = new Set();
  lineCountValueElement.textContent = "0";
  statusMessageElement.textContent =
    "「リロール」で項目を入れ替え、「開始」でビンゴスタート！";
}

/**
 * 全セルにシャッフルアニメーションを追加する
 */
function addShuffleAnimation() {
  /** @type {NodeListOf<HTMLElement>} 全ビンゴセル要素 */
  const cells = bingoCardElement.querySelectorAll(".bingoCell");

  cells.forEach((cell, index) => {
    /** 各セルに少しずつ遅延をつけてアニメーション */
    setTimeout(() => {
      cell.classList.add("bingoCell--shuffle");
      cell.addEventListener(
        "animationend",
        () => {
          cell.classList.remove("bingoCell--shuffle");
        },
        { once: true }
      );
    }, index * 30);
  });
}

/**
 * 開始ボタンの処理
 *
 * @description ゲームを開始し、カードを確定する。フリーマスを自動マーク。
 */
function handleStart() {
  if (appState.isStarted) {
    return;
  }

  /** ゲーム状態を開始に変更 */
  appState.isStarted = true;

  /** フリーマスを自動的にマーク済みにする */
  appState.markedCells[FREE_CELL_INDEX] = true;

  /** ボタンの状態を更新 */
  rerollButton.disabled = true;
  startButton.disabled = true;

  /** ステータスメッセージを更新 */
  statusMessageElement.textContent = "マスをタップして◯をつけよう！";

  /** カードを再描画（タップ有効化） */
  renderCard();

  /** ライン数を更新（フリーマスだけでは通常0） */
  updateLineCount();
}

/* ========================================
   イベントリスナーの設定
   ======================================== */

/**
 * 各種イベントリスナーを設定する
 */
function setupEventListeners() {
  rerollButton.addEventListener("click", handleReroll);
  startButton.addEventListener("click", handleStart);
}

/* ========================================
   アプリケーション初期化
   ======================================== */

/**
 * アプリケーションを初期化する
 *
 * @async
 * @description 項目の読み込み → カード生成 → 描画 → イベント設定
 */
async function initApp() {
  try {
    /** 項目データを読み込み */
    appState.allItems = await loadItems();

    /** 初期カードを生成・描画 */
    appState.currentItems = generateCardItems();
    renderCard();

    /** イベントリスナーを設定 */
    setupEventListeners();

    console.log(
      `initApp: アプリケーション初期化完了（項目数: ${appState.allItems.length}）`
    );
  } catch (error) {
    console.error(`initApp: 初期化に失敗しました: ${error.message}`);
    statusMessageElement.textContent =
      "アプリの読み込みに失敗しました。ページを再読み込みしてください。";
  }
}

/** アプリケーション起動 */
initApp();
