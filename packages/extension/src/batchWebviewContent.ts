import * as vscode from 'vscode';
import type { BatchExtMessage } from './batchBridge.js';

export function getBatchWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const batchJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'batch.js'));
  const sharedCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));
  const batchCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'batch.css'));
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${sharedCss}">
  <link rel="stylesheet" href="${batchCss}">
  <title>Image Studio — Batch Convert</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${batchJs}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

export function postToBatchWebview(panel: vscode.WebviewPanel, msg: BatchExtMessage): void {
  panel.webview.postMessage(msg);
}
