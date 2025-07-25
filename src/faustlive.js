/*
        A Faustlive like Web application.
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

import { deleteQrCode, updateQrCode, cancelLoader } from "./exportUI";
import { getSHAKey, sendPrecompileRequest } from "./ExportLib";
import { activateMIDIInput, loadPageState, restoreMenus, saveDSPState, savePageState, setLocalStorage } from "./runfaust";
import { audio_context, compileDSP, deleteDSP, DSP, expandDSP, workletAvailable } from "./compilefaust";
import { getStorageItemValue } from "./localStorage"

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

export var codeEditor = CodeMirror.fromTextArea(myTextarea, {
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

function fileSelectHandler(e) {
    fileDragHover(e);
    var files = e.target.files || e.dataTransfer.files;
    f = files[0];
    uploadFile(f);
}

function uploadOn(e, callback) {
    console.log('Drop URL : ', e.dataTransfer.getData('URL'));

    // CASE 1 : THE DROPPED OBJECT IS A URL TO SOME FAUST CODE
    if (e.dataTransfer.getData('URL') &&
        e.dataTransfer.getData('URL').split(':').shift() != 'file') {
        var url = e.dataTransfer.getData('URL');

        // Get filename
        var filename = url.toString().split('/').pop();
        console.log('filename is : ', filename);
        document.getElementById('filename').value = filename;
        var xmlhttp = new XMLHttpRequest();

        xmlhttp.onreadystatechange =
            function () {
                if (xmlhttp.readyState === 4 && xmlhttp.status === 200) {
                    console.log('CASE 1');
                    dsp_code = xmlhttp.responseText;
                    callback();
                }
            }

        try {
            xmlhttp.open('GET', url, false);
            // Avoid error "mal formé" on firefox
            xmlhttp.overrideMimeType('text/html');
            xmlhttp.send();
        } catch (err) {
            alert(err);
        }

    } else if (e.dataTransfer.getData('URL').split(':').shift() != 'file') {
        dsp_code = e.dataTransfer.getData('text');

        // CASE 2 : THE DROPPED OBJECT IS SOME FAUST CODE
        if (dsp_code) {
            console.log('CASE 2');
            // dsp_code = "process = vgroup(\"" + "TEXT" + "\", environment{" +
            // dsp_code + "}.process);";
            callback();
        }

        // CASE 3 : THE DROPPED OBJECT IS A FILE CONTAINING SOME FAUST CODE
        else {
            var files = e.target.files || e.dataTransfer.files;
            var file = files[0];

            if (location.host.indexOf('sitepointstatic') >= 0) return;

            var request = new XMLHttpRequest();
            if (request.upload) {
                console.log('CASE 3');

                var reader = new FileReader();
                var ext = file.name.toString().split('.').pop();
                var filename = file.name.toString().split('.').shift();
                console.log('filename is ', filename + '.' + ext);
                document.getElementById('filename').value = filename + '.' + ext;

                var type;

                if (ext === 'dsp') {
                    type = 'dsp';
                    reader.readAsText(file);
                } else if (ext === 'json') {
                    type = 'json';
                    reader.readAsText(file);
                }

                reader.onloadend = function (e) {
                    dsp_code = reader.result;
                    callback();
                };
            }
        }
    }
    // CASE 4 : ANY OTHER STRANGE THING
    else {
        window.alert('This object is not Faust code...');
    }
}

function uploadFile(e) {
    fileDragHover(e);
    uploadOn(e, updateDSPCode);
}

function fileDragHover(e) {
    e.stopPropagation();
    e.preventDefault();
}

function updateDSPCode() {
    codeEditor.setValue(dsp_code);
}

function configureDropZone(zoneid) {
    var filedrag1 = document.getElementById(zoneid);
    filedrag1.addEventListener('dragover', fileDragHover, false);
    filedrag1.addEventListener('dragleave', fileDragHover, false);
    filedrag1.addEventListener('drop', uploadFile, false);
}

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
export function saveFaustCode() {
    console.log('save faust code');
    download(document.getElementById('filename').value, codeEditor.getValue());
}

// Read faust source file from file system
// e: event
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
function ctrlRunFaustCode(ev) {
    if (ev.ctrlKey && ev.key == 'r') {
        startStopFaustCode();
    }
}

// Start or Stop Faust Code
function startStopFaustCode() {
    if (isFaustCodeRunning()) {
        stopFaustCode()
    } else {
        runFaustCode();
    }
}

// Check if the Faust Code is running or not
function isFaustCodeRunning() {
    return document.getElementById('faustuiwrapper').style.display == 'block';
}

// Run the Faust Code
function runFaustCode() {
    audio_context.resume();
    dsp_code = codeEditor.getValue();
    console.log('run faust code : ', dsp_code);

    document.getElementById('faustuiwrapper').style.display = 'block';
    compileDSP();
}

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

// Stop the currently running Faust code
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
function back3ch(pos) {
    return { 'line': pos.line, 'ch': pos.ch - 3 };
}

// Test is a character is alpha numeric
function isAlphaNumeric(code) {
    return (
        (code > 47 && code < 58) ||  // numeric (0-9)
        (code > 64 && code < 91) ||  // upper alpha (A-Z)
        (code > 96 && code < 123));
}

// Test if a string is a two letters library prefix: 'xx.'
function isLibPrefix(str) {
    return (str.length == 3) && isAlphaNumeric(str.charCodeAt(0)) &&
        isAlphaNumeric(str.charCodeAt(1)) && (str.charCodeAt(2) == 46);
}

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

function openBlockDiagram() {
    if (expandDSP(codeEditor.getValue())) {
        console.log('open block diagram visualisation');
        getSHAKey(
            document.getElementById('exportUrl').value,
            document.getElementById('filename').value.split('.')[0],
            codeEditor.getValue(), trigBlockDiagram, cancelLoader);
    } else {
        alert(faust.getErrorMessage());
    }
}

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

export function closeExportDialog() {
    console.log('close Export Dialog');
    document.getElementById('exportwrapper').style.display = 'none';
}

// startWaitingQrCode: show spinning gear
function startWaitingQrCode() {
    console.log('start Waiting QrCode');
    document.getElementById('loader').style.display = 'block';
}

// startWaitingQrCode: hide spinning gear
function stopWaitingQrCode() {
    console.log('stop Waiting QrCode');
    document.getElementById('loader').style.display = 'none';
}

// trigCompilation: sendPrecompileRequest : show QrCode if success
function trigCompilation(key) {
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

    sendPrecompileRequest(
        document.getElementById('exportUrl').value, key, plateform, architecture,
        sha => {
            stopWaitingQrCode();
            updateQrCode(sha, document.getElementById('qrDiv'));
        });
}

// exportFaustSource: send sourcecode to export URL : get back shakey and trig
// compilation if success
export function exportFaustSource() {
    getSHAKey(
        document.getElementById('exportUrl').value,
        document.getElementById('filename').value.split('.')[0],
        codeEditor.getValue(), trigCompilation, cancelLoader);

    /*
    console.log(expandDSP(codeEditor.getValue()));
    getSHAKey(document.getElementById("exportUrl").value,
            document.getElementById("filename").value.split(".")[0],
            expandDSP(codeEditor.getValue()),
            trigCompilation,
            cancelLoader);
    */
}

//-----------------------------------------------------------------------
// Config Dialog
//-----------------------------------------------------------------------

export function openConfigDialog() {
    console.log('Open Configuration Dialog');
    document.getElementById('configwrapper').style.display = 'block';
}

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
function init() {
    console.log('FaustEditor: version 1.5.4');

    // Try to load code from current URL
    configureEditorFromUrlParams();

    // Configure editor
    configureDropZone('myDropZone');

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
