import QRCode from "qrcode";
import { fetchJson, fetchWithTimeout } from "./network";

/************************************************************
 ***************** Interface to FaustWeb *********************
 ************************************************************/

//--- Send asynchronous GET request to FaustWeb to get the list of available targets
// @exportUrl : url of FaustWeb service to target
// @callback : function called once request succeeded
// @errCallback : function called once request failed
// @return : the available targets as a JSON application
// json = {"platform1":["arch1", "arch2", ..., "archn"], ... , "platformn":["arch1", "arch2", ..., "archn"]}

export async function getTargets(exportUrl) {
    return await fetchJson(`${exportUrl}/targets`);
}

//--- Send asynchronous POST request to FaustWeb to compile a Faust DSP
// @exportUrl : url of FaustWeb service to target
// @name : name of DSP to compile
// @source_code : Faust code to compile
// @callback : function called once request succeeded
// @errCallback : function called once request failed
// @return : the sha key corresponding to source_code
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

//--- Send asynchronous GET request to precompile target
// @exportUrl : url of FaustWeb service to target
// @sha : sha key of DSP to precompile
// @platform/architecture : platform/architecture to precompile
// @callback : function called once request succeeded
// @return : @param : the sha key
export async function sendPrecompileRequest(exportUrl, sha, platform, architecture) {
    const compileUrl = `${exportUrl}/${sha}/${platform}/${architecture}/precompile`;
    const response = await fetchWithTimeout(compileUrl);
    if (!response.ok) {
        throw new Error(`Precompile request failed with status ${response.status}`);
    }
    return sha;
}

//--- Transform target
// WARNING = THIS FUNCTION REQUIRES QRCODE.JS TO BE INCLUDED IN YOUR HTML FILE
// @exportUrl : url of FaustWeb service to target
// @sha : sha key of DSP
// @platform/architecture/target : platform/architecture/target compiled
// @cote : width and height of the returned QrCode
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

// Return the array of available platforms from the json description
function normaliseTargets(targets) {
    if (typeof targets === "string") {
        return JSON.parse(targets);
    }
    return targets;
}

export function getPlatforms(targets) {
    const data = normaliseTargets(targets);
    return Object.keys(data);
}

// Return the list of available architectures for a specific platform from the json description
export function getArchitectures(targets, platform) {
    const data = normaliseTargets(targets);
    return data[platform] ?? [];
}
