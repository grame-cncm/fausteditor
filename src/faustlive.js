/**
 * Faust Editor front-end: orchestrates CodeMirror, UI wiring, and Faust WASM integration.
 * Exposes functions that handle file management, compilation triggers, and documentation links.
 */

import CodeMirror from "codemirror";
import "codemirror/mode/clike/clike";
import "./codemirror/mode/faust/faust.js";
import "./codemirror/mode/faust/faustsnippets.js";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/dialog/dialog";
import "codemirror/addon/search/search";
import "codemirror/addon/hint/show-hint";
import "./codemirror/addon/hint/anyword-hint"; // customized
import "./codemirror/addon/hint/faust-hint";

import "codemirror/";

import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url"
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url"
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url"

import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";

import { fetchText } from "./utils/network";
import { deleteQrCode, updateQrCode, cancelLoader, changeArchs, onEnterKey } from "./utils/export-ui";
import { getSHAKey, sendPrecompileRequest } from "./utils/export-lib";
import {
    activateMIDIInput,
    loadPageState,
    restoreMenus,
    saveDSPState,
    savePageState,
    setLocalStorage,
    setBufferSize,
    setDSPStorage,
    setPoly,
    setPolyVoices,
    setRenderingMode,
    setSampleFormat,
    setSourceStorage,
} from "./runfaust";
import { audio_context, compileDSP, deleteDSP, DSP, expandDSP, workletAvailable } from "./compilefaust";
import { getStorageItemValue } from "./utils/local-storage"

export var dsp_code = '';

const docPath = 'https://faustlibraries.grame.fr/libs/';
const docSections = {
    "aa": "antialiased",
    "an": "analyzers",
    "ba": "basics",
    "co": "compressors",
    "de": "delays",
    "dm": "demos",
    "dx": "dx7",
    "en": "envelopes",
    "fd": "fds",
    "fi": "filters",
    "ho": "hoa",
    "it": "interpolators",
    "ma": "maths",
    "mi": "mi",
    "ef": "misceffects",
    "os": "oscillators",
    "no": "noises",
    "pf": "phaflangers",
    "pm": "physmodels",
    "qu": "quantizers",
    "rm": "reducemaps",
    "re": "reverbs",
    "ro": "routes",
    "si": "signals",
    "so": "soundfiles",
    "sp": "spats",
    "sy": "synths",
    "ve": "vaeffects",
    "vl": "version",
    "wa": "webaudio",
    "wd": "wdmodels"
};

const textarea = document.getElementById("myTextarea");
if (!textarea) {
    throw new Error("Faust editor textarea not found");
}

/**
 * Main CodeMirror instance used to edit Faust source.
 */
export var codeEditor = CodeMirror.fromTextArea(textarea, {
    lineNumbers: true,
    mode: 'faust',
    smartIndent: true,
    tabSize: 4,
    theme: 'eclipse',
    lineWrapping: true,
    allowDropFileTypes: ['application/octet-stream'],
    indentWithTabs: true,
    matchBrackets: true,
    autoCloseBrackets: true
});

const filenameInput = document.getElementById('filename');
const isExternalUrl = (value) => Boolean(value) && !value.toLowerCase().startsWith('file:');

/**
 * Reflect the active filename in the UI input.
 * @param {string} name
 */
function setActiveFilename(name) {
    if (filenameInput && name) {
        filenameInput.value = name;
    }
}

/**
 * Replace the editor contents with freshly loaded Faust code.
 * @param {string} code
 */
function applyLoadedCode(code) {
    if (code !== undefined && code !== null) {
        dsp_code = code;
        updateDSPCode();
    }
}

/**
 * Read a dropped or uploaded file as UTF-8 text.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
        reader.readAsText(file);
    });
}

/**
 * Resolve Faust code content from a drag/drop or input event.
 * @param {DragEvent | InputEvent} event
 * @returns {Promise<string|null>}
 */
async function resolveCodeFromEvent(event) {
    const { dataTransfer, target } = event;

    if (dataTransfer) {
        const droppedUrl = dataTransfer.getData('URL');
        if (isExternalUrl(droppedUrl)) {
            console.log('CASE 1');
            const filename = droppedUrl.toString().split('/').pop();
            setActiveFilename(filename);
            return await fetchText(droppedUrl, { mode: 'cors' });
        }

        const inlineCode = dataTransfer.getData('text');
        if (inlineCode) {
            console.log('CASE 2');
            return inlineCode;
        }

        if (dataTransfer.files && dataTransfer.files.length > 0) {
            console.log('CASE 3');
            const file = dataTransfer.files[0];
            setActiveFilename(file.name);
            return await readFileAsText(file);
        }
    }

    const files = target && target.files;
    if (files && files.length > 0) {
        console.log('CASE 3');
        const file = files[0];
        setActiveFilename(file.name);
        return await readFileAsText(file);
    }

    return null;
}

/**
 * Handler for drop events that loads code into the editor.
 * @param {DragEvent} event
 */
async function uploadFile(event) {
    fileDragHover(event);
    try {
        const code = await resolveCodeFromEvent(event);
        if (code) {
            applyLoadedCode(code);
        } else {
            window.alert('This object is not Faust code...');
        }
    } catch (err) {
        console.error(err);
        window.alert(err?.message ?? err);
    }
}

/**
 * Prevent default browser behaviour while dragging files over the drop zone.
 * @param {DragEvent} e
 */
function fileDragHover(e) {
    e.stopPropagation();
    e.preventDefault();
}

/**
 * Push the current `dsp_code` string into CodeMirror.
 */
function updateDSPCode() {
    codeEditor.setValue(dsp_code);
}

/**
 * Attach drag-and-drop listeners to the provided zone id.
 * @param {string} zoneid
 */
function configureDropZone(zoneid) {
    var filedrag1 = document.getElementById(zoneid);
    filedrag1.addEventListener('dragover', fileDragHover, false);
    filedrag1.addEventListener('dragleave', fileDragHover, false);
    filedrag1.addEventListener('drop', uploadFile, false);
}

/**
 * Trigger a browser download for the supplied text.
 * @param {string} filename
 * @param {string} text
 */
function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute(
        'href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();
    document.body.removeChild(element);
}

//-----------------------------------------------------------------------
// Load and Save Faust code on the local file system
//-----------------------------------------------------------------------

// Save section
/**
 * Download the current Faust source as a local file.
 */
export function saveFaustCode() {
    console.log('save faust code');
    download(document.getElementById('filename').value, codeEditor.getValue());
}

// Read faust source file from file system
// e: event
/**
 * Load a selected file from the file input element into CodeMirror.
 * @param {Event} evt
 */
function readSourceFile(evt) {
    var file = evt.target.files[0];
    if (!file) {
        return;
    }
    document.getElementById('filename').value = file.name;
    var reader = new FileReader();
    reader.onload = function (e) {
        var contents = e.target.result;
        codeEditor.setValue(contents);
    };
    reader.readAsText(file);
}

// Load Faust file from local file system via #fileinput element
/**
 * Open the hidden file input to load Faust source from disk.
 */
export function loadFaustCode() {
    console.log('load faust code');
    var gFileInput = document.getElementById('fileinput');
    gFileInput.addEventListener('change', readSourceFile, false);
    gFileInput.click();
}

//---------------------------------------------------------------------------------
// Configure the editor using parameters in the URL. This function should be
// called at init time.
//
// buffer=128|256|512|...|8192
// poly=ON|OFF
// nvoices=4|8|16|32|64|128
// ftz=0|1|2
// rendering=ScriptProcessor|AudioWorklet
// format=float|double
// code=<dsp-code-url>
// inline=<base64url-encoded-faust>
//
// Example:
// https://faust.grame.fr/editor/?code=https://faust.grame.fr/modules/Kisana.dsp
// https://faust.grame.fr/editor/?buffer=256&poly=on&nvoices=4&code=https://raw.githubusercontent.com/grame-cncm/faust/master-dev/tests/architecture-tests/organ.dsp
// https://faust.grame.fr/editor/?inline=cHJvY2VzcyA9ICs7IC8vIHRlc3Q

/**
 * Initialise the editor using query-string parameters when present.
 */
function configureEditorFromUrlParams() {
    var params = new URLSearchParams(window.location.search);

    // Restore internal state
    if (params.has('buffer')) buffer_size = params.get('buffer');
    if (params.has('poly')) {
        poly_flag = params.get('poly').toUpperCase();
    }
    if (params.has('nvoices')) poly_nvoices = params.get('nvoices');
    if (params.has('ftz')) ftz_flag = params.get('ftz');
    if (params.has('rendering')) rendering_mode = params.get('rendering');
    if (params.has('sample')) sample_format = params.get('sample');

    // And reflect it in the menus
    restoreMenus();

    // set editor content either from inline code
    var inlinecode = params.get('inline');
    if (inlinecode) {
        console.log('inline code is', inlinecode);
        codeEditor.setValue(atob(inlinecode));
    }

    // set editor content from url
    var curl = params.get('code');
    if (curl) {
        console.log('code url is', curl);
        fetch(curl, { 'mode': 'cors' }).then(function (response) {
            return response.text().then(function (text) {
                codeEditor.setValue(text);
                // update the title with the name of the file
                var f1 = curl.lastIndexOf('/');
                var filename = curl.substring(f1 + 1);
                console.log('filename is : ', filename);
                document.getElementById('filename').value = filename;
            })
        });
    }
}

//-----------------------------------------------------------------------
// Run the Faust code in the code editor
//-----------------------------------------------------------------------

// an event handler that runs or stop the faust code (CTRL-R)
/**
 * Listen for Ctrl+R to toggle DSP execution.
 * @param {KeyboardEvent} ev
 */
function ctrlRunFaustCode(ev) {
    if (ev.ctrlKey && ev.key == 'r') {
        startStopFaustCode();
    }
}

// Start or Stop Faust Code
/**
 * Toggle between running and stopping the current DSP.
 */
function startStopFaustCode() {
    if (isFaustCodeRunning()) {
        stopFaustCode()
    } else {
        runFaustCode();
    }
}

// Check if the Faust Code is running or not
/**
 * Determine whether the Faust UI modal is currently visible.
 * @returns {boolean}
 */
function isFaustCodeRunning() {
    return document.getElementById('faustuiwrapper').style.display == 'block';
}

// Run the Faust Code
/**
 * Compile and start the DSP currently present in the editor.
 */
function runFaustCode() {
    audio_context.resume();
    dsp_code = codeEditor.getValue();
    console.log('run faust code : ', dsp_code);

    document.getElementById('faustuiwrapper').style.display = 'block';
    compileDSP();
}

/**
 * Enable primary action buttons once the editor is initialised.
 */
function activateButtons() {
    // Setup the click action
    var div1 = document.querySelector('#run');
    div1.style.opacity = '1';
    div1.onclick = runFaustCode;

    var div2 = document.querySelector('#export');
    div2.style.opacity = '1';
    div2.onclick = openExportDialog;

    var div3 = document.querySelector('#block');
    div3.style.opacity = '1';
    div3.onclick = openBlockDiagram;
}

/**
 * Attach event listeners to toolbar controls and configuration UI.
 */
function wireUiEvents() {
    const getElement = (id) => document.getElementById(id);

    const bindClick = (id, handler) => {
        const element = getElement(id);
        if (element) {
            element.addEventListener('click', handler);
        }
    };

    const bindChange = (id, handler) => {
        const element = getElement(id);
        if (element) {
            element.addEventListener('change', handler);
        }
    };

    bindClick('upload', loadFaustCode);
    bindClick('save', saveFaustCode);
    bindClick('doc', faustDocumentation);
    bindClick('config', openConfigDialog);
    bindClick('exportButton', exportFaustSource);

    const exportUrlInput = getElement('exportUrl');
    if (exportUrlInput) {
        exportUrlInput.addEventListener('keyup', onEnterKey);
    }

    bindChange('Platform', () => changeArchs());
    bindChange('Architecture', () => {
        const qrContainer = getElement('qrDiv');
        if (qrContainer) {
            deleteQrCode(qrContainer);
        }
    });

    bindChange('selectedPoly', () => {
        const select = getElement('selectedPoly');
        if (select) {
            setPoly(select);
        }
    });

    bindChange('selectedBuffer', () => {
        const select = getElement('selectedBuffer');
        if (select) {
            setBufferSize(select);
        }
    });

    bindChange('polyVoices', () => {
        const select = getElement('polyVoices');
        if (select) {
            setPolyVoices(select);
        }
    });

    bindChange('selectedRenderingMode', () => {
        const select = getElement('selectedRenderingMode');
        if (select) {
            setRenderingMode(select);
        }
    });

    bindChange('selectedSampleFormat', () => {
        const select = getElement('selectedSampleFormat');
        if (select) {
            setSampleFormat(select);
        }
    });

    const dspStorage = getElement('dspstorage');
    if (dspStorage) {
        dspStorage.addEventListener('change', () => setDSPStorage(dspStorage.checked));
    }

    const sourceStorage = getElement('sourcestorage');
    if (sourceStorage) {
        sourceStorage.addEventListener('change', () => setSourceStorage(sourceStorage.checked));
    }

    document.querySelector('#faustuiwrapper .closeBtn')?.addEventListener('click', stopFaustCode);
    document.querySelector('#exportwrapper .closeBtn')?.addEventListener('click', closeExportDialog);
    document.querySelector('#configwrapper .closeBtn')?.addEventListener('click', closeConfigDialog);
}

// Stop the currently running Faust code
/**
 * Stop DSP processing and hide the Faust UI modal.
 */
export function stopFaustCode() {
    console.log('stop faust code');

    // Delete the UI content in the DOM
    deleteDSP();

    document.getElementById('faustuiwrapper').style.display = 'none';
}

//-----------------------------------------------------------------------
// Open Faust documentation
//-----------------------------------------------------------------------

// Left-extend a position by 3 characters
/**
 * Move caret position three characters to the left (used for prefix detection).
 * @param {{line:number, ch:number}} pos
 * @returns {{line:number, ch:number}}
 */
function back3ch(pos) {
    return { 'line': pos.line, 'ch': pos.ch - 3 };
}

// Test is a character is alpha numeric
/**
 * Check whether a character code corresponds to an alphanumeric character.
 * @param {number} code
 * @returns {boolean}
 */
function isAlphaNumeric(code) {
    return (
        (code > 47 && code < 58) ||  // numeric (0-9)
        (code > 64 && code < 91) ||  // upper alpha (A-Z)
        (code > 96 && code < 123));
}

// Test if a string is a two letters library prefix: 'xx.'
/**
 * Determine if the given string looks like a Faust library prefix (e.g. "fi.").
 * @param {string} str
 * @returns {boolean}
 */
function isLibPrefix(str) {
    return (str.length == 3) && isAlphaNumeric(str.charCodeAt(0)) &&
        isAlphaNumeric(str.charCodeAt(1)) && (str.charCodeAt(2) == 46);
}

/**
 * Build the documentation URL for the provided word and cursor position.
 * @param {string} word
 * @param {{anchor:{line:number,ch:number}, head:{line:number,ch:number}}} pos
 * @returns {string}
 */
function buildDocURL(word, pos) {
    // console.log("We are inside a word, left-extend 3 characters
    // to get the prefix 'xx.'");
    const prefix = codeEditor.getRange(back3ch(pos.anchor), pos.anchor);
    if (isLibPrefix(prefix)) {
        // we have a prefix, we extend the word to search with the prefix
        console.log('a valid prefix found', '"' + prefix + '"');
        word = codeEditor.getRange(back3ch(pos.anchor), pos.head);
        // we remove the . : xx.foo ==> xxfoo
        word = word.slice(0, 2) + word.slice(3);
        return docPath + docSections[prefix.slice(0, 2)] + '/#' + word.toLowerCase();
    } else {
        // no valid prefix, we keep the word as it is
        console.log('no valid prefix found', '"' + prefix + '"');
        return docPath;
    }
}

// Open the documentation for the function under the cursor,
// handle special case at the end of a word.
/**
 * Open the Faust documentation page related to the current selection or cursor.
 */
export function faustDocumentation() {
    // console.log("open Faust documentation");
    let word = codeEditor.getSelection();
    // Default URL is the librairies 
    let docURL = docPath;
    let pos;
    if (word === '') {
        // We don't have a selection, therefore we try to figure 
        // out the function name at the curseur position
        const curs = codeEditor.getCursor();
        pos = codeEditor.findWordAt(curs);
        word = codeEditor.getRange(pos.anchor, pos.head);
        if (isAlphaNumeric(word.charCodeAt(0))) {
            docURL = buildDocURL(word, pos);
        } else {
            console.log('It seems that we are at the end of a word !');
            // try to find a word before and start the whole process again
            pos = codeEditor.findWordAt({ 'line': curs.line, 'ch': curs.ch - 1 });
            word = codeEditor.getRange(pos.anchor, pos.head);
            if (isAlphaNumeric(word.charCodeAt(0))) {
                docURL = buildDocURL(word, pos);
            }
        }
    } else {
        // We have a selection
        pos = codeEditor.listSelections()[0];
        docURL = buildDocURL(word, pos);
    }

    console.log('open documentation link for word', '"' + word + '"');
    console.log('docURL', '"' + docURL + '"');
    window.open(docURL, 'documentation');
}

//-----------------------------------------------------------------------
// Block diagram visualization
//-----------------------------------------------------------------------

/**
 * Request the FaustWeb service to render a block diagram for the current DSP.
 */
async function openBlockDiagram() {
    if (expandDSP(codeEditor.getValue())) {
        console.log('open block diagram visualisation');
        try {
            const sha = await getSHAKey(
                document.getElementById('exportUrl').value,
                document.getElementById('filename').value.split('.')[0],
                codeEditor.getValue());
            trigBlockDiagram(sha);
        } catch (error) {
            console.error(error);
            cancelLoader();
            window.alert(error?.message ?? 'Unable to generate block diagram.');
        }
    } else {
        alert(faust.getErrorMessage());
    }
}

/**
 * Open the generated block diagram in a new browser tab.
 * @param {string} key
 */
function trigBlockDiagram(key) {
    console.log('We got the key', key);
    console.log(
        'the url is : ',
        document.getElementById('exportUrl').value + '/' + key +
        '/diagram/process.svg');
    window.open(
        document.getElementById('exportUrl').value + '/' + key +
        '/diagram/process.svg',
        'blockdiagram');
}

//-----------------------------------------------------------------------
// Export Dialog
//-----------------------------------------------------------------------

/**
 * Display the export modal after validating the current DSP source.
 */
function openExportDialog() {
    if (expandDSP(codeEditor.getValue())) {
        console.log('open Export Dialog');
        document.getElementById('exportwrapper').style.display = 'block';
        if (!codeEditor.isClean()) {
            deleteQrCode(document.getElementById('qrDiv'));
            codeEditor.markClean();
        }
    } else {
        alert(faust.getErrorMessage());
    }
}

/**
 * Hide the export modal and reset its loading state.
 */
export function closeExportDialog() {
    console.log('close Export Dialog');
    document.getElementById('exportwrapper').style.display = 'none';
}

// startWaitingQrCode: show spinning gear
/**
 * Show the spinner while waiting for a QR code payload.
 */
function startWaitingQrCode() {
    console.log('start Waiting QrCode');
    document.getElementById('loader').style.display = 'block';
}

// startWaitingQrCode: hide spinning gear
/**
 * Hide the spinner once a QR code payload has been processed.
 */
function stopWaitingQrCode() {
    console.log('stop Waiting QrCode');
    document.getElementById('loader').style.display = 'none';
}

// trigCompilation: sendPrecompileRequest : show QrCode if success
/**
 * Send a remote compilation request and refresh the QR code preview.
 * @param {string} key
 */
async function trigCompilation(key) {
    console.log('trigCompilation ' + key);
    var plateform =
        document.getElementById('Platform')
            .options[document.getElementById('Platform').selectedIndex]
            .value;
    var architecture =
        document.getElementById('Architecture')
            .options[document.getElementById('Architecture').selectedIndex]
            .value;

    startWaitingQrCode();

    try {
        const sha = await sendPrecompileRequest(
            document.getElementById('exportUrl').value, key, plateform, architecture);
        stopWaitingQrCode();
        await updateQrCode(sha, document.getElementById('qrDiv'));
    } catch (error) {
        console.error(error);
        stopWaitingQrCode();
        window.alert(error?.message ?? 'Failed to trigger remote compilation.');
    }
}

// exportFaustSource: send sourcecode to export URL : get back shakey and trig
// compilation if success
/**
 * Upload the current DSP to FaustWeb and display resulting build artefacts.
 */
export async function exportFaustSource() {
    try {
        const sha = await getSHAKey(
            document.getElementById('exportUrl').value,
            document.getElementById('filename').value.split('.')[0],
            codeEditor.getValue());
        await trigCompilation(sha);
    } catch (error) {
        console.error(error);
        cancelLoader();
        window.alert(error?.message ?? 'Failed to export Faust source.');
    }

    /*
    Example alternative: export an expanded DSP instead of the raw source.
    const expanded = expandDSP(codeEditor.getValue());
    const sha = await getSHAKey(document.getElementById("exportUrl").value,
        document.getElementById("filename").value.split(".")[0],
        expanded);
    await trigCompilation(sha);
    */
}

//-----------------------------------------------------------------------
// Config Dialog
//-----------------------------------------------------------------------

/**
 * Display the configuration modal to adjust runtime options.
 */
export function openConfigDialog() {
    console.log('Open Configuration Dialog');
    document.getElementById('configwrapper').style.display = 'block';
}

/**
 * Hide the configuration modal.
 */
export function closeConfigDialog() {
    console.log('Close Configuration Dialog');
    document.getElementById('configwrapper').style.display = 'none';
}

//-----------------------------------------------------------------------
// Code Mirror configuration
//-----------------------------------------------------------------------

codeEditor.setOption(
    'extraKeys', { 'Ctrl-D': faustDocumentation, 'Ctrl-R': startStopFaustCode });

// We want to show possible completions only when we type a character
codeEditor.on('keyup', function (editor, event) {
    if (event.key.length == 1) {
        const ch = event.key[0];
        if (ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z') {
            CodeMirror.showHint(editor, null, { completeSingle: false });
        }
    }
});

const tippyOptions = {
    theme: "honeybee",
    arrow: true,
    content(reference) {
        const title = reference.getAttribute('title');
        reference.removeAttribute('title');
        return title;
    },
}

for (const className of ["action-button", "action-select", "dropzone", "dynamic-button"]) {
    tippy(`.${className}`, tippyOptions)
}

// To activate audio on iOS
window.addEventListener('touchstart', function () {
    // create empty buffer
    var buffer = audio_context.createBuffer(1, 1, 22050);
    var source = audio_context.createBufferSource();
    source.buffer = buffer;

    // connect to output (your speakers)
    source.connect(audio_context.destination);

    // play the file
    source.start();

}, false);

//-----------------------------------------------------------------------
// Initialization
//-----------------------------------------------------------------------

// Main entry point, called when libfaust.js has finished to load
/**
 * Bootstraps the editor once the Faust WASM module is available.
 */
function init() {
    console.log('FaustEditor: version 1.6.0');

    // Try to load code from current URL
    configureEditorFromUrlParams();

    // Configure editor
    configureDropZone('myDropZone');
    wireUiEvents();

    // Check AudioWorklet support
    if (!workletAvailable()) {
        document.getElementById('selectedRenderingMode').disabled = true;
        console.log(
            'AudioWorklet is not supported, ScriptProcessor model only will be available');
    }

    // Activate MIDI
    activateMIDIInput();

    // Activate locate storage for DSP state
    setLocalStorage(true);

    // Load page state
    loadPageState();

    // Restore 'save DSP control parameters' checkbox state
    document.getElementById('dspstorage').checked =
        (getStorageItemValue('FaustEditor', 'FaustDSPStorage') === 'on');

    // Restore 'save DSP source' checkbox state
    document.getElementById('sourcestorage').checked =
        (getStorageItemValue('FaustEditor', 'FaustSourceStorage') === 'on');

    // Timer to save page and DSP state to local storage
    setInterval(function () {
        savePageState();
        if (DSP) {
            saveDSPState();
        }
    }, 1000);

    document.addEventListener('keypress', ctrlRunFaustCode, true);

    // Make the run, export, block buttons usable
    activateButtons();
}

// Setup the main entry point in libfaust.js
(async () => {
    const {
        instantiateFaustModuleFromFile,
        FaustCompiler,
        FaustMonoDspGenerator,
        FaustPolyDspGenerator,
        LibFaust
    } = await import("@grame/faustwasm");
    // Init Faust compiler and node factory 
    const module = await instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL);
    const libFaust = new LibFaust(module);
    window.faust_compiler = new FaustCompiler(libFaust);
    window.get_faust_mono_factory = () => new FaustMonoDspGenerator();
    window.get_faust_poly_factory = () => new FaustPolyDspGenerator();
    init();
})();
