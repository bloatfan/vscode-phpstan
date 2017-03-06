'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'path';
import {
    ExtensionContext, workspace, Disposable
} from 'vscode';
import {
    ServerOptions, TransportKind, LanguageClientOptions,
    LanguageClient, SettingMonitor
} from 'vscode-languageclient';
import * as protocol from './protocol';
import { Status } from "./status";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
    // The debug options for the server
    let debugOptions = { execArgv: ["--nolazy", "--debug=6299"] };

    // If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

    	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: ['php'],
		synchronize: {
			// Synchronize the setting section 'phpstan' to the server
			configurationSection: 'phpstan',
			// Notify the server about file changes to '.phpstan.neon files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/phpstan.neon')
		}
	}

    let status = new Status();
    // Create the language client and start the client.
	let client = new LanguageClient('phpstan', 'php static analyse', serverOptions, clientOptions);
    client.onReady().then(() => {
        client.onNotification(protocol.DidStartValidateTextDocumentNotification.type, (event): void => {
            status.startProcessing(event.textDocument.uri);
        });
        client.onNotification(protocol.DidEndValidateTextDocumentNotification.type, (event): void => {
            status.endProcessing(event.textDocument.uri);
        });
    });

    // Create the settings monitor and start the monitor for the client.
	let monitor = new SettingMonitor(client, 'phpstan.enable').start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(monitor);
    context.subscriptions.push(status);
}

// this method is called when your extension is deactivated
export function deactivate() {
}