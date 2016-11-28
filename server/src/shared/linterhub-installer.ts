import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { parse as parseUrl } from 'url';
import { getProxyAgent } from './proxy';
import { executeChildProcess } from './util';
import { LinterhubMode } from './linterhub-cli'
import { PlatformInformation } from './platform'

export function install(mode: LinterhubMode) {
    // TODO
    if (mode == LinterhubMode.docker) {
        return downloadDock();
    } else {
        return PlatformInformation.GetCurrent().then(info => {
            let url = buildPackageUrl(info);
            return downloadFile(url, "proxy", false);
        });
    }
}

function buildPackageUrl(info: PlatformInformation) {
    return "";
}

export function getDockerVersion() {
    return executeChildProcess("docker version --format '{{.Server.Version}}'").then(removeNewLine);
}

export function getDotnetVersion() {
    return executeChildProcess('dotnet --version').then(removeNewLine);
}

function removeNewLine(out: string): string {
    return out.replace('\n', '').replace('\r', '');
}

export function downloadDock(): Promise<void> {
    return executeChildProcess("docker pull busybox");
}

export function downloadFile(urlString: string, proxy: string, strictSSL: boolean): Promise<void> {
    const url = parseUrl(urlString);

    const options: https.RequestOptions = {
        host: url.host,
        path: url.path,
        agent: getProxyAgent(url, proxy, strictSSL),
        rejectUnauthorized: strictSSL
    };

    return new Promise<void>((resolve, reject) => {
        let request = https.request(options, response => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Redirect - download from new location
                return resolve(downloadFile(response.headers.location, proxy, strictSSL));
            }

            if (response.statusCode != 200) {
                return reject(new Error(response.statusCode.toString()));
            }
            
            // Downloading - hook up events
            let packageSize = parseInt(response.headers['content-length'], 10);
            let downloadedBytes = 0;
            let downloadPercentage = 0;
            let dots = 0;
            let tmpFile = fs.createWriteStream('/Volumes/Repositories/Repometric/temp.json');

            response.on('data', data => {
                downloadedBytes += data.length;

                // Update status bar item with percentage
                let newPercentage = Math.ceil(100 * (downloadedBytes / packageSize));
                if (newPercentage !== downloadPercentage) {
                    downloadPercentage = newPercentage;
                }

                // Update dots after package name in output console
                let newDots = Math.ceil(downloadPercentage / 5);
                if (newDots > dots) {
                    dots = newDots;
                }
            });

            response.on('end', () => {
                resolve();
            });

            response.on('error', err => {
                reject(new Error(err));
            });

            // Begin piping data from the response to the package file
            response.pipe(tmpFile, { end: false });
        });

        request.on('error', error => {
            reject(new Error(error));
        });

        // Execute the request
        request.end();
    });
}