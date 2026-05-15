/**
 * K&k Co., Ltd. お問い合わせフォーム用 GAS
 * ============================================
 * このスクリプトは、サイトのお問い合わせフォームから
 * 送信されたデータを受け取って、
 *   1. 会社のメールアドレスに通知メールを送信
 *   2. お問い合わせいただいた方に自動返信メールを送信
 * します。
 *
 * デプロイ手順は README-GAS.md を参照してください。
 */

// ========== 設定 (ここを編集してください) ==========
const CONFIG = {
  // 会社のお問い合わせ受信用メールアドレス
  TO_EMAIL: 'info@nishihama-iron.jp',

  // 自動返信メールの送信者名
  FROM_NAME: 'K&k Co., Ltd.',

  // 会社名(自動返信メールの署名で使用)
  COMPANY_NAME: 'K&k Co., Ltd.',

  // 会社のWebサイトURL
  COMPANY_URL: 'https://onlyone-gift-kk.com',  // ← 公開URLに合わせて変更
};

// ========== メインの受信処理 ==========
function doPost(e) {
  try {
    const params = e.parameter || {};

    // ハニーポット(スパム対策) - botは隠しフィールドを埋めてしまう
    if (params.website) {
      return jsonResponse({ status: 'spam' });
    }

    // フォーム値の取得
    const name = (params.name || '').toString().trim();
    const email = (params.email || '').toString().trim();
    const company = (params.company || '').toString().trim();
    const phone = (params.phone || '').toString().trim();
    const message = (params.message || '').toString().trim();

    // 必須項目チェック
    if (!name || !email || !message) {
      return jsonResponse({ status: 'error', message: '必須項目が未入力です。' });
    }

    // メアド簡易チェック
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ status: 'error', message: 'メールアドレスの形式が正しくありません。' });
    }

    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

    // 1) 会社へ通知メール
    const adminBody = buildAdminBody({ name, company, email, phone, message, timestamp });
    GmailApp.sendEmail(
      CONFIG.TO_EMAIL,
      `【お問い合わせ】${name} 様より`,
      adminBody,
      {
        name: CONFIG.FROM_NAME,
        replyTo: email,
      }
    );

    // 2) お客様へ自動返信メール
    const userBody = buildUserBody({ name, company, email, phone, message, timestamp });
    GmailApp.sendEmail(
      email,
      '【自動返信】お問い合わせを受け付けました - ' + CONFIG.COMPANY_NAME,
      userBody,
      {
        name: CONFIG.FROM_NAME,
      }
    );

    // ログ用にスプレッドシートへ記録(任意)
    try {
      logToSheet({ timestamp, name, company, email, phone, message });
    } catch (err) {
      // スプレッドシート連携でエラーが出てもメール送信は完了しているので無視
      console.warn('logToSheet error:', err);
    }

    return jsonResponse({ status: 'success' });

  } catch (err) {
    console.error(err);
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// GET でアクセスされたとき用の表示
function doGet() {
  return ContentService
    .createTextOutput('K&k Contact Endpoint - POST only')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ========== メール本文の組み立て ==========
function buildAdminBody({ name, company, email, phone, message, timestamp }) {
  return [
    'K&k Co., Ltd. お問い合わせフォームより',
    '新しいお問い合わせが届きました。',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'お名前    : ' + name,
    '会社名    : ' + (company || '(未記入)'),
    'メール    : ' + email,
    '電話番号  : ' + (phone || '(未記入)'),
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '【ご相談内容】',
    message,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '送信日時 : ' + timestamp,
    '',
    '※ このメールに返信すると、お客様(' + email + ')に直接届きます。',
  ].join('\n');
}

function buildUserBody({ name, company, email, phone, message, timestamp }) {
  return [
    name + ' 様',
    '',
    'この度は ' + CONFIG.COMPANY_NAME + ' にお問い合わせいただき、',
    '誠にありがとうございます。',
    '',
    '下記内容でお問い合わせを承りましたのでご確認ください。',
    '担当者より2営業日以内にご連絡いたします。',
    '今しばらくお待ちくださいますようお願い申し上げます。',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'お名前    : ' + name,
    '会社名    : ' + (company || '(未記入)'),
    'メール    : ' + email,
    '電話番号  : ' + (phone || '(未記入)'),
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '【ご相談内容】',
    message,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '受付日時 : ' + timestamp,
    '',
    '※ このメールは自動送信されています。',
    '※ ご返信は不要です。',
    '※ お心当たりがない場合はお手数ですが、本メールを破棄してください。',
    '',
    '----------------------------------------',
    CONFIG.COMPANY_NAME,
    'Web サイト・LP 制作・運用',
    'Email : ' + CONFIG.TO_EMAIL,
    'Web   : ' + CONFIG.COMPANY_URL,
    '----------------------------------------',
  ].join('\n');
}

// ========== ユーティリティ ==========
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== ログ記録 (任意機能) ==========
// スプレッドシートにお問い合わせ履歴を残したい場合、
// 下の SHEET_ID を有効化してください。
// 1. 新しいスプレッドシートを作成
// 2. URL末尾の長い文字列 (例: 1abc...xyz) をコピー
// 3. 下の SHEET_ID をその値に書き換える
const SHEET_ID = ''; // ← 例: '1abc...xyz' を入れると有効化

function logToSheet(data) {
  if (!SHEET_ID) return; // 未設定なら何もしない

  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Contacts');
  if (!sheet) {
    sheet = ss.insertSheet('Contacts');
    sheet.appendRow(['日時', 'お名前', '会社名', 'メール', '電話', 'ご相談内容']);
  }
  sheet.appendRow([
    data.timestamp,
    data.name,
    data.company,
    data.email,
    data.phone,
    data.message,
  ]);
}

// ========== テスト用関数 ==========
// GASエディタで実行して、メール送信のテストができます
function testSend() {
  const fakeEvent = {
    parameter: {
      name: 'テスト 太郎',
      company: 'テスト株式会社',
      email: CONFIG.TO_EMAIL, // テスト用に自社宛て
      phone: '090-1234-5678',
      message: 'これはテスト送信です。',
    },
  };
  const result = doPost(fakeEvent);
  console.log(result.getContent());
}
