# 会話文AIの有効化（Cloudflare Pages）

このリポジトリには `functions/api/conversation.js` があり、Cloudflare Pages Functions から Workers AI を呼び出します。

## 初回設定

1. Cloudflare ダッシュボード → Workers & Pages → `sales-report-maker` → Settings → Bindings を開く。
2. **Add binding** → **Workers AI** を選び、Variable name を **`AI`** にする。
3. 保存後、Pages の最新デプロイを再実行する（GitHubへの新規コミットでも可）。
4. サイトでニュースを選び「AIで話す文章をつくる」を押す。AI未設定・通信エラー時は簡易版へ自動的に切り替わる。

**APIキーをHTMLやGitHubに書かないこと。** Workers AI binding はサーバー側だけで動作します。

## 制約

- ニュースの入力根拠は現在RSS概要で、記事全文の自動検証は行いません。
- 概要がない見出しのみの記事は、AIが事実を補わないよう簡易版に切り替えます。
- 生成結果は公開前・利用前に事実確認が必要です。
- Cloudflare Workers AIには日次無料枠と使用制限があります。利用状況をCloudflareのダッシュボードで確認してください。
- 公開サイトのアクセス数に応じた呼び出し制限・不正利用対策は今後の運用課題です。公開集客を拡大する前にレート制限を設定してください。

## 確認方法

- `/api/conversation` はPOST専用。
- Pages Functionsのデプロイ後、AI bindingがない場合はHTTP 503で `AI_BINDING_REQUIRED` を返します。
- ニュース画面はエラー時に従来の簡易生成へフォールバックします。
