import * as vscode from 'vscode';
import { ImageEditorProvider } from './imageEditorProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ImageEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ImageEditorProvider.viewType,
      provider,
      { supportsMultipleEditorsPerDocument: false },
    ),
  );
}

export function deactivate(): void {}
