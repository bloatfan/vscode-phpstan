/// <reference path="thenable.d.ts" />

'use strict';

import {
	TextDocumentIdentifier, TextDocumentChangeEvent
} from 'vscode-languageserver-types';

import {
	TextDocument, IConnection, IPCMessageReader, IPCMessageWriter,
	createConnection, TextDocuments, InitializeParams, InitializeResult,
	ResponseError, InitializeError, DidChangeConfigurationParams,
	Files, DidChangeWatchedFilesParams, PublishDiagnosticsParams
} from 'vscode-languageserver';

import * as os from 'os';
import * as url from 'url';
import * as protocol from "./protocol";
import { PhpstanLinter } from './phpstan/linter';
import { PhpstanSettings } from './phpstan/setting';

class PhpstanServer {
	private validating: { [uri: string]: TextDocument };
	private connection: IConnection;
	private documents: TextDocuments;
	private rootPath: string;
	private linter: PhpstanLinter;
	private settings: PhpstanSettings;
	private ready: boolean = false;

	constructor() {
		this.validating = Object.create(null);
		this.connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
		this.documents = new TextDocuments();
		this.documents.listen(this.connection);
		this.connection.onInitialize((params) => {
            return this.onInitialize(params);
        });
		this.connection.onDidChangeConfiguration((params) => {
            this.onDidChangeConfiguration(params);
        });
		this.connection.onDidChangeWatchedFiles((params) => {
            this.onDidChangeWatchedFiles(params);
        });
		this.documents.onDidOpen((event) => {
            this.onDidOpenDocument(event);
        });
		this.documents.onDidChangeContent((event) =>{
			this.onDidChangeDocument(event);
		});
		this.documents.onDidSave((event) => {
            this.onDidSaveDocument(event);
        });
		this.documents.onDidClose((event) => {
            this.onDidCloseDocument(event);
        });
	}

	/**
	 * Handles server initialization.
	 *
	 * @param params The initialization parameters.
	 * @return A promise of initialization result or initialization error.
	 */
    private onInitialize(params: InitializeParams) : Thenable<InitializeResult | ResponseError<InitializeError>> {
		this.rootPath = params.rootPath;
		return PhpstanLinter.resolvePath(this.rootPath).then((linter): InitializeResult | ResponseError<InitializeError> => {
			console.log("then");
			this.linter = linter;
			let result: InitializeResult = {
				capabilities: {
					textDocumentSync: this.documents.syncKind
				}
			};
			return result;
		}, (error) => {
			console.log(error);
			return Promise.reject(new ResponseError<InitializeError>(99, error, { retry: true }))
		});
    }

	/**
	 * Handles configuration changes.
	 *
	 * @param params The changed configuration parameters.
	 * @return void
	 */
    private onDidChangeConfiguration(params: DidChangeConfigurationParams): void {
		console.log(params.settings.phpstan);
        this.settings = params.settings.phpcs;
        this.ready = true;
        this.validateMany(this.documents.all());
    }

	/**
	 * Handles watched files changes.
	 *
	 * @param params The changed watched files parameters.
	 * @return void
	 */
	private onDidChangeWatchedFiles(params: DidChangeWatchedFilesParams) : void {
		this.validateMany(this.documents.all());
	}

	/**
	 * Handles opening of text documents.
	 *
	 * @param event The text document change event.
	 * @return void
	 */
	private onDidOpenDocument(event: TextDocumentChangeEvent ) : void {
		console.log('private onDidOpenDocument(event: TextDocumentChangeEvent ) : void');
		this.validateSingle(event.document);
	}

	/**
	 * Handles changes of text documents.
	 *
	 * @param event The text document change event.
	 * @return void
	 */
	private onDidChangeDocument(event: TextDocumentChangeEvent ) : void {
		console.log('private onDidChangeDocument(event: TextDocumentChangeEvent ) : void');
		this.validateSingle(event.document);
	}

	/**
	 * Handles saving of text documents.
	 *
	 * @param event The text document change event.
	 * @return void
	 */
	private onDidSaveDocument(event: TextDocumentChangeEvent ) : void {
		console.log('private onDidChangeDocument(event: TextDocumentChangeEvent ) : void');
		this.validateSingle(event.document);
	}

	/**
	 * Handles closing of text documents.
	 *
	 * @param event The text document change event.
	 * @return void
	 */
	private onDidCloseDocument(event: TextDocumentChangeEvent ) : void {
  		this.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
	}

	/**
	 * Sends a notification for starting validation of a document.
	 *
	 * @param document The text document on which validation started.
	 */
	private sendStartValidationNotification(document: TextDocument): void {
		this.validating[ document.uri ] = document;
		this.connection.sendNotification(
			protocol.DidStartValidateTextDocumentNotification.type,
			{ textDocument: TextDocumentIdentifier.create( document.uri ) }
		);
	}
	/**
	 * Sends a notification for ending validation of a document.
	 *
	 * @param document The text document on which validation ended.
	 */
	private sendEndValidationNotification(document: TextDocument): void {
		delete this.validating[ document.uri ];
		this.connection.sendNotification(
			protocol.DidEndValidateTextDocumentNotification.type,
			{ textDocument: TextDocumentIdentifier.create( document.uri ) }
		);
	}

		/**
	 * Validate a single text document.
	 *
	 * @param document The text document to validate.
	 * @return void
	 */
    public validateSingle(document: TextDocument): void {
		if (this.validating[ document.uri ] === undefined ) {
			this.sendStartValidationNotification(document);
			this.linter.lint(document, this.settings, this.rootPath).then(diagnostics => {
				this.sendEndValidationNotification(document);
				this.sendDiagnostics({ uri: document.uri, diagnostics });
			}, (error) => {
				this.sendEndValidationNotification(document);
				this.connection.window.showErrorMessage(this.getExceptionMessage(error, document));
			});
		}
    }
	/**
	 * Validate a list of text documents.
	 *
	 * @param documents The list of textdocuments to validate.
	 * @return void
	 */
    public validateMany(documents: TextDocument[]): void {
		documents.forEach((document: TextDocument) =>{
			this.validateSingle(document);
		});
		// let tracker = new ErrorMessageTracker();
		// let promises: Thenable<PublishDiagnosticsParams>[] = [];

		// documents.forEach((document: TextDocument) => {
		// 	this.sendStartValidationNotification(document);
		// 	promises.push( this.linter.lint(document, this.settings, this.rootPath).then<PublishDiagnosticsParams>((diagnostics: Diagnostic[]): PublishDiagnosticsParams => {
		// 		this.connection.console.log(`processing: ${document.uri}`);
		// 		this.sendEndValidationNotification(document);
		// 		let diagnostic = { uri: document.uri, diagnostics };
		// 		this.sendDiagnostics(diagnostic);
		// 		return diagnostic;
		// 	}, (error: any): PublishDiagnosticsParams => {
		// 		this.sendEndValidationNotification(document);
		// 		tracker.add(this.getExceptionMessage(error, document));
		// 		return { uri: document.uri, diagnostics: [] };
		// 	}));
		// });

		// Promise.all( promises ).then( results => {
		// 	tracker.sendErrors(this.connection);
		// });
    }

	/**
	 * Get the exception message from an exception object.
	 *
	 * @param exeption The exception to parse.
	 * @param document The document where the exception occured.
	 * @return string The exception message.
	 */
    private getExceptionMessage(exception: any, document: TextDocument): string {
        let msg: string = null;
        if (typeof exception.message === "string" || exception.message instanceof String) {
            msg = <string>exception.message;
            msg = msg.replace(/\r?\n/g, " ");
            if (/^ERROR: /.test(msg)) {
                msg = msg.substr(5);
            }
        } else {
            msg = `An unknown error occured while validating file: ${Files.uriToFilePath(document.uri) }`;
        }
        return `phpstan: ${msg}`;
    }

	/**
     * Sends diagnostics computed for a given document to VSCode to render them in the
     * user interface.
     *
     * @param params The diagnostic parameters.
     */
    private sendDiagnostics(params: PublishDiagnosticsParams): void {
		this.connection.sendDiagnostics(params);
	}

	/**
	 * Start listening to requests.
	 *
	 * @return void
	 */
    public listen(): void {
        this.connection.listen();
    }
}

let phpstanServer = new PhpstanServer();
phpstanServer.listen();
