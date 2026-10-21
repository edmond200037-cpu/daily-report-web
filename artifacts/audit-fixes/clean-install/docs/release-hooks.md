# 發布前檢查

每個 checkout 安裝一次：

```sh
npm run hooks:install
```

`git push` 前，`.githooks/pre-push` 會執行 `npm run check:release`，依序跑完整測試與正式建置；任一項失敗就停止推送。這與 GitHub Pages 的測試、建置步驟一致。修改版面時，也必須同步維護對應的版面契約測試。

手動驗證：

```sh
npm run check:release
```

遇到 EPERM 等環境問題，先修復執行環境，不略過檢查。推送成功後仍需確認 GitHub Actions 的 deploy 成功；本機 hook 通過不代表線上已發布。

Git hook 設定不會隨 clone 自動啟用；新 checkout 需要重新安裝。安裝程式遇到其他 hooksPath 會停止，以保留原有設定。
