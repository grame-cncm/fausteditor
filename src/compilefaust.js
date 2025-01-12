import { dsp_code } from "./faustlive";
import { activateAudioInput, audio_input, buffer_size, checkPolyphonicDSP, ftz_flag, loadDSPState, poly_flag, poly_nvoices, rendering_mode, sample_format, resetAudioInput } from "./runfaust";
import { FaustUI } from "@shren/faust-ui";

var isWebKitAudio = (typeof (webkitAudioContext) !== "undefined");
var isWasm = (typeof (WebAssembly) !== "undefined");

if (!isWasm) {
    alert("WebAssembly is not supported in this browser, the page will not work !")
}

export var isPoly = false;

export var audio_context = (isWebKitAudio) ? new webkitAudioContext({ latencyHint: 0.00001 }) : new AudioContext({ latencyHint: 0.00001 });
audio_context.destination.channelInterpretation = "discrete";
// To enable multi-channels inputs/outputs
audio_context.destination.channelCount = audio_context.destination.maxChannelCount;

export var DSP = null;

const faustUIRoot = document.getElementById("faust-ui");
let faustUI;
export const output_handler = (path, value) => faustUI.paramChangeByDSP(path, value);

var midi_input = [];
var factory_stack = [];
var faust_svg = null;

// compute libraries URL relative to current page
var wurl = window.location.href;
var qm = wurl.indexOf('?');
if (qm > 0) {
    wurl = wurl.substr(0, qm);  // remove options from the URL
}
var libraries_url = wurl.substr(0, wurl.lastIndexOf('/')) + "/libraries/";
console.log("URL:", libraries_url);

export function workletAvailable() {
    if (typeof (OfflineAudioContext) === "undefined") return false;
    var context = new OfflineAudioContext(1, 1, 44100);
    return context.audioWorklet && typeof context.audioWorklet.addModule === 'function';
}

export function deleteDSP() {
    if (DSP) {
        if (audio_input) {
            audio_input.disconnect(DSP);
        }
        DSP.disconnect(audio_context.destination);
        DSP.stopSensors();
        DSP.destroy();
        faustUIRoot.innerHTML = "";
        DSP = null;
        faustUI = null;
    }
}

function activateDSP(dsp) {
    if (dsp) {
        DSP = dsp;
        if (DSP.getNumInputs() > 0) {
            activateAudioInput();
        } else {
            resetAudioInput();
        }

        // Setup UI
        faustUI = new FaustUI({ ui: DSP.getUI(), root: faustUIRoot });
        faustUI.paramChangeByUI = (path, value) => DSP.setParamValue(path, value);
        DSP.setOutputParamHandler(output_handler);
        DSP.startSensors();
        DSP.connect(audio_context.destination);

        console.log(DSP.getNumInputs());
        console.log(DSP.getNumOutputs());

        loadDSPState();
    } else {
        alert(faust_compiler.getErrorMessage());
        // Fix me
        document.getElementById('faustuiwrapper').style.display = 'none';
    }
}

function activateMonoDSP(dsp) {
    activateDSP(dsp);
}

function activatePolyDSP(dsp) {
    activateDSP(dsp);
    checkPolyphonicDSP(dsp.getJSON());
}

async function compileMonoDSP(factory) {
    if (!factory) {
        alert('Faust DSP Factory not compiled');
        // Fix me
        document.getElementById('faustuiwrapper').style.display = 'none';
    } else if (rendering_mode === "ScriptProcessor") {
        console.log("ScriptProcessor createDSPInstance");
        const node = await faust_mono_factory.createNode(audio_context, "FaustDSP", factory, true, buffer_size);
        activateMonoDSP(node);
    } else {
        console.log("Worklet createDSPWorkletInstance");
        const node = await faust_mono_factory.createNode(audio_context, "FaustDSP", factory);
        activateMonoDSP(node);
    }
}

async function compilePolyDSP(voiceFactory, effectFactory) {
    if (!voiceFactory) {
        alert('Faust DSP Factory not compiled');
        // Fix me
        document.getElementById('faustuiwrapper').style.display = 'none';
    } else if (rendering_mode === "ScriptProcessor") {
        console.log("ScriptProcessor createPolyDSPInstance");
        const node = await faust_poly_factory.createNode(audio_context, poly_nvoices, "FaustDSP", voiceFactory, undefined, effectFactory, true, buffer_size);
        activatePolyDSP(node);
    } else {
        console.log("Worklet createPolyDSPWorkletInstance");
        const node = await faust_poly_factory.createNode(audio_context, poly_nvoices, "FaustDSP", voiceFactory, undefined, effectFactory);
        activatePolyDSP(node);
    }
}

export async function compileDSP() {
    deleteDSP();

    // Prepare argv list
    var argv = [];
    argv.push("-ftz");
    argv.push(ftz_flag);
    if (sample_format === "float") {
        argv.push("-single ");
    } else {
        argv.push("-double");
    }
    console.log(argv);

    if (poly_flag === "ON") {
        isPoly = true;
        console.log("Poly DSP");
        // Create a poly DSP factory from the dsp code
        try {
            window.faust_poly_factory = get_faust_poly_factory();
            const { voiceFactory, effectFactory } = await faust_poly_factory.compile(faust_compiler, "FaustDSP", dsp_code, argv.join(" "));
            compilePolyDSP(voiceFactory, effectFactory)
        } catch (error) {
            alert(error);
            // Fix me
            document.getElementById('faustuiwrapper').style.display = 'none';
        }
    } else {
        isPoly = false;
        console.log("Mono DSP");
        // Create a mono DSP factory from the dsp code
        try {
            window.faust_mono_factory = get_faust_mono_factory();
            const { factory } = await faust_mono_factory.compile(faust_compiler, "FaustDSP", dsp_code, argv.join(" "));
            compileMonoDSP(factory);
        } catch (error) {
            alert(error);
            // Fix me
            document.getElementById('faustuiwrapper').style.display = 'none';
        }
    }
}

export function expandDSP(dsp_code) {
    // Prepare argv list
    var argv = [];
    argv.push("-ftz");
    argv.push(ftz_flag);
    console.log(argv);

    return faust_compiler.expandDSP(dsp_code, argv.join(" "));
}
