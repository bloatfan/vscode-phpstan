import fs = require('fs');
import path = require('path');

export class PhpstanPathResolver {
    private rootPath: string;
    private phpstanPath: string;
    private phpstanExecutable: string;

    constructor(rootPath: string) {
        this.rootPath = rootPath;
        let extension = /^win/.test(process.platform) ? '.bat' : '';
        this.phpstanExecutable = `phpstan${extension}`;
    }

    hasComposerJson() : boolean {
        try {
            return fs.existsSync(path.join(this.rootPath, "composer.json"));
        } catch (exeption) {
            return false;
        }
    }

    hasComposerLock(): boolean {
	   try {
			return fs.existsSync(path.join(this.rootPath, "composer.lock"));
		} catch(exeption) {
			return false;
		}
	}

    hasComposerPhpcsDependency(): boolean {
        var result = false;
        let dependencies = {};
        try {
            dependencies = JSON.parse(fs.readFileSync(path.join(this.rootPath, "composer.lock"), "utf8"));
        } catch (exeption) {
        }
        var packages = [];
        if (dependencies['packages']) {
            packages = packages.concat(dependencies['packages']);
        }
        if (dependencies['packages-dev']) {
            packages = packages.concat(dependencies['packages-dev']);
        }
        let match = packages.filter((pkg) => {
            return pkg.name = 'phpstas/phpstan';
        });
        if (match.length != 0) {
            result = true;
        }

        return result;
    }

    getVendorPath(): string {
        let vendorPath = path.join(this.rootPath, "vendor", "bin", this.phpstanExecutable);

		// Safely load composer.json
		let config = null;
		try {
			config = JSON.parse(fs.readFileSync(path.join(this.rootPath, "composer.json"), "utf8"));
		}
		catch (exception) {
			config = {};
		}

		// Check vendor-bin configuration
		if (config["config"] && config["config"]["vendor-dir"]) {
			vendorPath = path.join(this.rootPath, config["config"]["vendor-dir"], "bin", this.phpstanExecutable);
		}

		// Check bin-bin configuration
		if (config["config"] && config["config"]["bin-dir"]) {
			vendorPath = path.join(this.rootPath, config["config"]["bin-dir"], this.phpstanExecutable);
		}

		return vendorPath;
    }

    resolve(): string {
        this.phpstanPath = this.phpstanExecutable;

		let pathSeparator = /^win/.test(process.platform) ? ";" : ":";
		let globalPaths = process.env.PATH.split(pathSeparator);
		globalPaths.forEach(globalPath => {
			let testPath = path.join( globalPath, this.phpstanExecutable );
			if (fs.existsSync(testPath)) {
				this.phpstanPath = testPath;
				return false;
			}
		});

        if (this.rootPath) {
            if (this.hasComposerJson()) {
                // Determine whether composer is installed.
				if (this.hasComposerLock()) {
					// Determine whether vendor/bin/phcs exists only when project depends on phpcs.
					if (this.hasComposerPhpcsDependency()) {
						let vendorPath = this.getVendorPath();
						if (fs.existsSync(vendorPath)) {
							this.phpstanPath = vendorPath;
						} else {
							throw `Composer phpstan dependency is configured but was not found under ${vendorPath}. You may need to update your dependencies using "composer update".`;
						}
					}

				} else {
					throw `A composer configuration file was found at the root of your project but seems uninitialized. You may need to initialize your dependencies using "composer install".`;
				}
            }
        }

        return this.phpstanPath;
    }
}