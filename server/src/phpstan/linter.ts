import fs = require('fs');
import path = require('path');
import cp = require("child_process");

import { TextDocument, Diagnostic, Files, DiagnosticSeverity } from 'vscode-languageserver';
import { PhpstanPathResolver } from './pathResolver';
import { PhpstanSettings } from './setting';

export class PhpstanLinter {
    private path: string;
    // private version: PhpstanVersion;

    private constructor(path: string) {
        this.path = path;
    }

    /**
	* Resolve the phpstan path.
	*/
    public static resolvePath(rootPath: string): Thenable<any> {
        return new Promise<any>((resolve, reject) => {
            try {
                let phpstanPathResolver = new PhpstanPathResolver(rootPath);
				let phpstanPath = phpstanPathResolver.resolve();
                let command = phpstanPath;

                // Make sure we escape spaces in paths on Windows.
				if ( /^win/.test(process.platform) ) {
					command = `"${command}"`;
				}

                cp.exec(`${command} --version`, function(error, stdout, stderr) {
                    console.log(error);
                    if (error) {
						reject("phpstan: Unable to locate phpstan. Please add phpstan to your global path or use composer depency manager to install it in your project locally.");
					}
                    resolve(new PhpstanLinter(phpstanPath));
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    public lint(document: TextDocument, settings: PhpstanSettings, rootPath?: string): Thenable<Diagnostic[]> {
		return new Promise<Diagnostic[]>((resolve, reject) => {

            // Process linting paths.
			let filePath = Files.uriToFilePath(document.uri);
			let fileText = document.getText();
			let executablePath = this.path;

            // Return empty on empty text.
			if (fileText === '') {
				return resolve([]);
			}

            // Process linting arguments.
			let lintArgs = ['analyse', '--format=json', '--no-progress'];
			console.log(settings);

            if (settings != null && settings.level != null) {
				if (settings.level > 5) {
					reject('phpstan.level can\'t over 5');
				}
                lintArgs.push(`--level=${settings.level}`);
            } else {
				lintArgs.push(`--level=5`);
			}

            if (settings != null && settings.autoloadFile != null) {
                lintArgs.push(`--autoload-file=${settings.autoloadFile}`);
            }
            if (settings != null && settings.configuration != null) {
                lintArgs.push(`--configuration=${settings.configuration}`);
            }

            // Make sure we escape spaces in paths on Windows.
			if ( /^win/.test(process.platform) ) {
				if (/\s/g.test(filePath)) {
					filePath = `"${filePath}"`;
				}
				if (/\s/g.test(executablePath)) {
					executablePath = `"${executablePath}"`;
				}
			}

			lintArgs.push(document.uri.replace('file://', ''));

            let command = null;
			let args = null;
			let phpstan = null;

            let options = {
				env: process.env,
				encoding: "utf8",
				timeout: 0,
				maxBuffer: 1024 * 1024,
				detached: true,
				windowsVerbatimArguments: true,
			};

            if ( /^win/.test(process.platform) ) {
				command = process.env.comspec || "cmd.exe";
				args = ['/s', '/c', '"', executablePath].concat(lintArgs).concat('"');
				phpstan = cp.execFile( command, args, options );
			} else {
				command = executablePath;
				args = lintArgs;
				phpstan = cp.spawn( command, args, options );
			}

            let result = "";
            phpstan.stderr.on("data", (buffer: Buffer) => {
				result += buffer.toString();
			});

            phpstan.stdout.on("data", (buffer: Buffer) => {
				result += buffer.toString();
			});

            phpstan.on("close", (code: string) => {
				try {
					result = result.toString().trim();

					var diagnostics: Diagnostic[] = [];
					if (result.trim() != '') {
						var reportJson = JSON.parse(result);
						var severity: DiagnosticSeverity = DiagnosticSeverity.Error;
						for (var file in reportJson) {
							var fileErrors = reportJson[file];
							console.log(fileErrors);
							for (var i = 0, length = fileErrors.length; i < length; i++) {
								var line = fileErrors[i]['line'] - 1;
								let range = {
									start: {line, character: 0 },
									end: {line, character: 0 }
								};
								var diagnostic = Diagnostic.create(range, fileErrors[i]['message'], severity, null, 'phpstan');
								diagnostics.push(diagnostic);
							}
						}
					}

					resolve(diagnostics);
				}
				catch (e) {
					reject(e);
				}
			});

            phpstan.stdin.write( fileText );
			phpstan.stdin.end();
		});
	}
}