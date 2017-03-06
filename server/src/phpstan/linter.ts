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
                console.log('resolvePath');
                let phpstanPathResolver = new PhpstanPathResolver(rootPath);
				let phpstanPath = phpstanPathResolver.resolve();
                let command = phpstanPath;
                console.log(command);

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
            var diagnostics = [];
                diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: 1, character: 0},
                    end: { line: 1, character: 10 }
                },
                message: `should be spelled TypeScript`,
                source: 'ex'
            });
            resolve(diagnostics);
		});
	}
}