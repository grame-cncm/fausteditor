import { getArchitectures, getPlatforms, getQrCode, getTargets } from "./export-lib";

export function onEnterKey(event) {
    if (!event) {
        var event = window.event;
    }

    if (event.keyCode === 13) {
        event.preventDefault();
        updateFWTargets();
    }
}

function openExport() {
    document.getElementById("plusImg").style.visibility = "hidden";
    document.getElementById("moinsImg").style.visibility = "visible";
    document.getElementById("export").style.visibility = "visible";
}

function closeExport(event) {
    if (!event) {
        event = window.event;
    }

    var target = event.target;
    while (target && target != document.getElementById("export") && target !=
        document.getElementById("plusImg")) {
        target = target.parentNode;
    }

    if (!target) {
        document.getElementById("plusImg").style.visibility = "visible";
        document.getElementById("moinsImg").style.visibility = "hidden";
        document.getElementById("export").style.visibility = "hidden";
    }
}

export function deleteQrCode(div) {
    if (div !== undefined) {
        for (var i = div.children.length - 1; i >= 0; i--) {
            if (div.children[i].id != "loader") {
                div.removeChild(div.children[i]);
            }
        }
    }
}

// TODO(ijc): Looks like this is unused.
function forgeURL() {
    const plateform = document.getElementById("Platform").options[document.getElementById("Platform").selectedIndex].value;
    const architecture = document.getElementById("Architecture").options[document.getElementById("Architecture").selectedIndex].value;
    const output = (plateform === "android") ? "binary.apk" : "binary.zip";

    return document.getElementById("exportUrl").value + "/" + sha + "/" + plateform + "/" + architecture + "/" + output;
}

export async function updateQrCode(sha, div) {
    deleteQrCode(div);

    var plat = document.getElementById("Platform").options[document.getElementById("Platform").selectedIndex].value;
    var arch = document.getElementById("Architecture").options[document.getElementById("Architecture").selectedIndex].value;
    let target;
    // Check the different possible targets
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

export function cancelLoader() {
    document.getElementById("loader").style.visibility = "hidden";
}

function cleanComboBox(id) {
    while (document.getElementById(id).childNodes.length > 0) {
        document.getElementById(id).removeChild(document.getElementById(id).childNodes[0]);
    }
}

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

async function updateFWTargets() {
    // Clean combobox before adding new options
    cleanComboBox("Platform");
    cleanComboBox("Architecture");

    try {
        const targets = await getTargets(document.getElementById("exportUrl").value);
        window.json = targets;
        var platforms = getPlatforms(targets);

        for (var i = 0; i < platforms.length; i++) {
            var o = document.createElement("option");
            o.text = platforms[i];
            document.getElementById("Platform").options.add(o);
        }

        changeArchs();
    } catch (error) {
        console.error(error);
        window.alert('Unable to retrieve available targets. Please check the export service URL.');
    }
}

updateFWTargets();

/* document.getElementById("refreshButton").onclick = updateFWTargets;
document.getElementById("plusImg").onclick = openExport;
document.getElementById("moinsImg").onclick = closeExport;
document.body.addEventListener("click", closeExport, false);
 */
