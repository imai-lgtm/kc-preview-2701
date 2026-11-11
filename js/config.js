// 設定はここだけ触ればよい

// 数の報告（診断人数・タイプの割合・誌面やお店への案内のタップ数）
//   '' にすると送らない（サーバーなしで動く）。Cloudflare に置いたら '/api' にする
export const STATS_API = '';

// 結果カードの下に入れる文字（読者がカードを見てアクセスできるように）
export const SHARE_URL = '';          // 例：'kureyon-kao.pages.dev'
export const ISSUE_LABEL = 'くれよん 2027年1月号 西北版';

// 誌面のビューティー特集のページ（決まったら '12' のように入れる。空なら「誌面のビューティー特集」とだけ出る）
export const FEATURE_PAGE = '';
export const FEATURE_TITLE = 'ビューティー特集';

// 見本の掲載店（?demo=1）を出してよいアドレス。手元と、確認用URLだけを入れる（本番のアドレスは入れない）
//   例：確認用URLが 'kakunin.kureyon-kao.pages.dev' なら、それをそのまま足す
export const DEMO_HOSTS = ['localhost', '127.0.0.1', 'imai-lgtm.github.io'];   // 最後のは営業用の見本URL（GitHub Pages）