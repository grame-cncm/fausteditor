/**
 * @fileoverview Library for interacting with a FaustWeb export service.
 *
 * This module provides asynchronous functions to communicate with a FaustWeb
 * backend. It allows fetching available compilation targets, uploading
 * Faust DSP code to get a unique SHA key, triggering pre-compilation requests,
 * and generating QR codes for binary download links. It also includes
 * helper functions to parse the list of platforms and architectures
 * returned by the service.
 */

import QRCode from "qrcode";
import { fetchJson, fetchWithTimeout } from "./network";

/************************************************************
 ***************** Interface to FaustWeb *********************
 ************************************************************/

/**
 * Fetches the list of available compilation targets from the FaustWeb service.
 * The result is a JSON object mapping platforms to arrays of architectures.
 * e.g., {"platform1":["arch1", "arch2"], "platform2":["arch1", "arch3"]}
 *
 * @param {string} exportUrl - The base URL of the FaustWeb export service.
 * @returns {Promise<any>} A promise that resolves with the JSON targets object.
 * @throws {Error} Throws if the network request fails or returns a non-ok status.
 */
export async function getTargets(exportUrl) {
    return await fetchJson(`${exportUrl}/targets`);
}

/**
 * Uploads Faust source code to the FaustWeb service to get a unique SHA key.
 * This key is used for all subsequent compilation and download requests.
 *
 * @param {string} exportUrl - The base URL of the FaustWeb export service.
 * @param {string} name - The name of the DSP (e.g., "compressor").
 * @param {string} source_code - The Faust DSP code to compile.
 * @returns {Promise<string>} A promise that resolves with the SHA key as a string.
 * @throws {Error} Throws if the upload fails or returns a non-ok status.
 */
export async function getSHAKey(exportUrl, name, source_code) {
    const filename = `${name}.dsp`;
    const file = new File([source_code], filename, { type: "text/plain" });
    const params = new FormData();
    params.append('file', file);
    const response = await fetchWithTimeout(`${exportUrl}/filepost`, {
        method: "POST",
        body: params,
    });
    if (!response.ok) {
        throw new Error(`Uploading Faust DSP failed with status ${response.status}`);
    }
    return await response.text();
}

/**
 * Sends a request to the FaustWeb service to precompile a specific target.
 * This is an optimization to ensure the binary is ready before the user
 * tries to download it.
 *
 * @param {string} exportUrl - The base URL of the FaustWeb export service.
 * @param {string} sha - The SHA key for the DSP.
 * @param {string} platform - The target platform (e.g., "android").
 * @param {string} architecture - The target architecture (e.g., "arm64-v8a").
 * @returns {Promise<string>} A promise that resolves with the original SHA key on success.
 * @throws {Error} Throws if the request fails or returns a non-ok status.
 */
export async function sendPrecompileRequest(exportUrl, sha, platform, architecture) {
    const compileUrl = `${exportUrl}/${sha}/${platform}/${architecture}/precompile`;
    const response = await fetchWithTimeout(compileUrl);
    if (!response.ok) {
        throw new Error(`Precompile request failed with status ${response.status}`);
    }
    return sha;
}

/**
 * Generates an HTML element containing a QR code that links to a compiled binary.
 *
 * @param {string} url - The base URL of the FaustWeb export service.
 * @param {string} sha - The SHA key for the DSP.
 * @param {string} plateform - The target platform.
 * @param {string} architecture - The target architecture.
 * @param {string} target - The name of the target binary file (e.g., "binary.zip").
 * @param {number} size - The width and height of the QR code in pixels.
 * @returns {Promise<HTMLDivElement>} A promise resolving to a <div> element
 * containing the QR code image.
 */
export async function getQrCode(url, sha, plateform, architecture, target, size) {
    var downloadString = url + "/" + sha + "/" + plateform + "/" + architecture + "/" + target;
    var whiteContainer = document.createElement('div');
    whiteContainer.style.cssText = "width:" + size.toString() + "px; height:" +
        size.toString() +
        "px; background-color:white; position:relative; margin-left:auto; margin-right:auto; padding:3px;";
    whiteContainer.title = downloadString;

    var qq = document.createElement('img');
    qq.width = qq.height = size;
    qq.style = "display: block";
    qq.alt = "Scan me!"
    qq.src = await QRCode.toDataURL(downloadString, { errorCorrectionLevel: "H" });

    whiteContainer.appendChild(qq);
    return whiteContainer;
}

/**
 * Internal helper to ensure the targets object is in JSON format,
 * parsing it if it's a string.
 *
 * @param {string | object} targets - The targets data.
 * @returns {object} The parsed targets object.
 */
function normaliseTargets(targets) {
    if (typeof targets === "string") {
        return JSON.parse(targets);
    }
    return targets;
}

/**
 * Extracts all available platform names from the targets object.
 *
 * @param {string | object} targets - The targets object from `getTargets`.
 * @returns {string[]} An array of platform names (the object keys).
 */
export function getPlatforms(targets) {
    const data = normaliseTargets(targets);
    return Object.keys(data);
}

/**
 * Extracts all available architecture names for a specific platform.
 *
 * @param {string | object} targets - The targets object from `getTargets`.
 * @param {string} platform - The selected platform name.
 * @returns {string[]} An array of architecture names, or an empty array if
 * the platform doesn't exist.
 */
export function getArchitectures(targets, platform) {
    const data = normaliseTargets(targets);
    return data[platform] ?? [];
}