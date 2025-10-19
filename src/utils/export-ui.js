/**
 * @fileoverview Manages the user interface for the Faust export service.
 *
 * This script handles interactions with the export panel, including:
 * - Opening and closing the export UI.
 * - Fetching available export targets (platforms and architectures) from the server.
 * - Dynamically updating the 'Platform' and 'Architecture' dropdowns.
 * - Generating and displaying a QR code for the selected download target.
 * - Handling keyboard events for the export URL input.
 */

import { getArchitectures, getPlatforms, getQrCode, getTargets } from "./export-lib";

/**
 * Handles the 'Enter' key press event on an input field.
 * Prevents default form submission and triggers an update of the export targets.
 *
 * @param {KeyboardEvent} event - The keyboard event.
 */
export function onEnterKey(event) {
    if (!event) {
        var event = window.event;
    }

    if (event.keyCode === 13) {
        event.preventDefault();
        updateFWTargets();
    }
}

/**
 * Opens the export UI panel by adjusting element visibility.
 */
function openExport() {
    document.getElementById("plusImg").style.visibility = "hidden";
    document.getElementById("moinsImg").style.visibility = "visible";
    document.getElementById("export").style.visibility = "visible";
}

/**
 * Closes the export UI panel if a click occurs outside of it or its toggle button.
 *
 * @param {MouseEvent} event - The mouse click event.
 */
function closeExport(event) {
    if (!event) {
        event = window.event;
    }

    var target = event.target;
    // Traverse up the DOM to see if the click was inside the export panel
    while (target && target != document.getElementById("export") && target !=
        document.getElementById("plusImg")) {
        target = target.parentNode;
    }

    // If the click was not inside, close the panel
    if (!target) {
        document.getElementById("plusImg").style.visibility = "visible";
        document.getElementById("moinsImg").style.visibility = "hidden";
        document.getElementById("export").style.visibility = "hidden";
    }
}

/**
 * Removes all child elements from a container, except for an element with the id 'loader'.
 * Used to clear the previously generated QR code.
 *
 * @param {HTMLElement} div - The container element (e.g., 'qrDiv') to clear.
 */
export function deleteQrCode(div) {
    if (div !== undefined) {
        for (var i = div.children.length - 1; i >= 0; i--) {
            if (div.children[i].id != "loader") {
                div.removeChild(div.children[i]);
            }
        }
    }
}

/**
 * Constructs a download URL for the compiled binary based on current UI selections.
 *
 * @returns {string} The forged download URL.
 * @todo This function appears to be unused.
 */
function forgeURL() {
    const plateform = document.getElementById("Platform").options[document.getElementById("Platform").selectedIndex].value;
    const architecture = document.getElementById("Architecture").options[document.getElementById("Architecture").selectedIndex].value;
    const output = (plateform === "android") ? "binary.apk" : "binary.zip";

    return document.getElementById("exportUrl").value + "/" + sha + "/" + plateform + "/" + architecture + "/" + output;
}

/**
 * Generates and displays a new QR code based on the current UI selections.
 * Determines the correct target filename (e.g., .apk, .zip, .html) and
 * appends the new QR code to the specified container div.
 *
 * @async
 * @param {string} sha - The SHA key for the compiled DSP.
 * @param {HTMLElement} div - The container element (e.g., 'qrDiv') to append the QR code to.
 */
export async function updateQrCode(sha, div) {
    deleteQrCode(div);

    var plat = document.getElementById("Platform").options[document.getElementById("Platform").selectedIndex].value;
    var arch = document.getElementById("Architecture").options[document.getElementById("Architecture").selectedIndex].value;
    let target;

    // Determine the correct binary/target name
    if (arch === "pwa" || arch === "pwa-poly") {
        target = "index.html";
    } else if (plat === "chaos-stratus" && arch === "effect-installer") {
        target = "installer.sh"
    } else if (plat === "android") {
        target = "binary.apk";
    } else {
        target = "binary.zip";
    }

    var link = document.createElement('a');
    link.href = document.getElementById("exportUrl").value + "/" + sha + "/" + plat + "/" + arch + "/" + target;
    var myWhiteDiv = await getQrCode(document.getElementById("exportUrl").value, sha, plat, arch, target, 130);

    div.appendChild(link);
    link.appendChild(myWhiteDiv);
}

/**
 * Hides the 'loader' (spinner) element.
 */
export function cancelLoader() {
    document.getElementById("loader").style.visibility = "hidden";
}

/**
 * Removes all <option> elements from a <select> (combobox) element.
 *
 * @param {string} id - The `id` of the <select> element to clean.
 */
function cleanComboBox(id) {
    while (document.getElementById(id).childNodes.length > 0) {
        document.getElementById(id).removeChild(document.getElementById(id).childNodes[0]);
    }
}

/**
 * Populates the 'Architecture' dropdown based on the currently selected 'Platform'.
 * It reads from the globally cached `window.json` targets list.
 */
export function changeArchs() {
    // Clean combobox before adding new options
    cleanComboBox("Architecture");
    deleteQrCode(document.getElementById("qrDiv"));

    var platform = document.getElementById("Platform").options[document.getElementById("Platform").selectedIndex].value;
    var archs = getArchitectures(window.json, platform);

    for (var j = 0; j < archs.length; j++) {
        var a = document.createElement('option');
        a.text = archs[j];
        document.getElementById("Architecture").options.add(a);
    }
}

/**
 * Fetches the list of available targets from the export service URL.
 * It clears and repopulates the 'Platform' dropdown, then triggers
 * `changeArchs` to populate the 'Architecture' dropdown.
 * Caches the fetched targets in `window.json`.
 *
 * @async
 */
async function updateFWTargets() {
    // Clean combobox before adding new options
    cleanComboBox("Platform");
    cleanComboBox("Architecture");

    try {
        const targets = await getTargets(document.getElementById("exportUrl").value);
        window.json = targets; // Cache targets globally
        var platforms = getPlatforms(targets);

        for (var i = 0; i < platforms.length; i++) {
            var o = document.createElement("option");
            o.text = platforms[i];
            document.getElementById("Platform").options.add(o);
        }

        changeArchs(); // Populate architectures for the default platform
    } catch (error) {
        console.error(error);
        window.alert('Unable to retrieve available targets. Please check the export service URL.');
    }
}

// Initial fetch of targets when the script loads.
updateFWTargets();

/*
// Event listeners (assumed to be bound in HTML or another script)
document.getElementById("refreshButton").onclick = updateFWTargets;
document.getElementById("plusImg").onclick = openExport;
document.getElementById("moinsImg").onclick = closeExport;
document.body.addEventListener("click", closeExport, false);
*/