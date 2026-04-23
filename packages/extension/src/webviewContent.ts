import * as vscode from 'vscode';
import type { ExtMessage } from './bridge.js';

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const webviewJs = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'webview.js'),
  );
  const webviewCss = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'),
  );
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} blob: data:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${webviewCss}">
  <title>Image Studio</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${webviewJs}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function postToWebview(panel: vscode.WebviewPanel, msg: ExtMessage): void {
  panel.webview.postMessage(msg);
}
