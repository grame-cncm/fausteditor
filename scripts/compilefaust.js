"use strict";

var isWebKitAudio = (typeof (webkitAudioContext) !== "undefined");
var isWasm = (typeof (WebAssembly) !== "undefined");
var isPoly = false;

if (!isWasm) {
    alert("WebAssembly is not supported in this browser, the page will not work !")
}

var audio_context = (isWebKitAudio) ? new webkitAudioContext({ latencyHint: 0.00001 }) : new AudioContext({ latencyHint: 0.00001 });
audio_context.destination.channelInterpretation = "discrete";
var buffer_size = 1024;
var audio_input = null;
var midi_input = [];
var factory_stack = [];
var DSP = null;
var dsp_code = null;
var faust_svg = null;
var poly_flag = "OFF";
var ftz_flag = "2";
var poly_nvoices = 16;
var rendering_mode = "ScriptProcessor";
var output_handler = null;

// compute libraries URL relative to current page
var wurl = window.location.href;
var qm = wurl.indexOf('?');
if (qm > 0) {
    wurl = wurl.substr(0, qm);  // remove options from the URL
}
var libraries_url = wurl.substr(0, wurl.lastIndexOf('/')) + "/libraries/";
console.log("URL:", libraries_url);

function workletAvailable() {
    if (typeof (OfflineAudioContext) === "undefined") return false;
    var context = new OfflineAudioContext(1, 1, 44100);
    return context.audioWorklet && typeof context.audioWorklet.addModule === 'function';
}

// Do no keep more than 10 alive DSP factories
function checkFactoryStack(factory) {
    if (factory && factory_stack.indexOf(factory) === -1) {
        factory_stack.push(factory);
        if (factory_stack.length >= 10) {
            faust.deleteDSPFactory(factory_stack.shift());
        }
    }
}

function deleteDSP() {
    if (DSP) {
        if (audio_input) {
            audio_input.disconnect(DSP);
        }
        DSP.disconnect(audio_context.destination);
        DSP.destroy();
        _f4u$t.hard_delete(faust_svg);

        DSP = null;
        faust_svg = null;
    }
}

function activateDSP(dsp) {
    if (dsp) {
        DSP = dsp;
        if (DSP.getNumInputs() > 0) {
            activateAudioInput();
        } else {
            audio_input = null;
        }

        // Setup UI
        faust_svg = $('#faustui');
        output_handler = _f4u$t.main(DSP.getJSON(), $(faust_svg), function (path, val) { DSP.setParamValue(path, val); });
        DSP.setOutputParamHandler(output_handler);
        DSP.connect(audio_context.destination);

        console.log(DSP.getNumInputs());
        console.log(DSP.getNumOutputs());

        loadDSPState();
    } else {
        alert(faust.getErrorMessage());
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

async function compileDSP() {
    deleteDSP();

    // Prepare argv list, libraries are now included and loaded from the EMCC locale FS included in libfaust
    var argv = "-ftz " + ftz_flag.toString() + " -I libraries/";

    if (poly_flag === "ON") {
        isPoly = true;
        console.log("Poly DSP");
        // Create a poly DSP factory from the dsp code
        DSP = await fwan.compilePolyNode(audio_context, "FaustDSP", faust, dsp_code, argv, poly_nvoices, (rendering_mode === "ScriptProcessor"), buffer_size);
        activatePolyDSP(DSP);

    } else {
        isPoly = false;
        console.log("Mono DSP");
        // Create a mono DSP factory from the dsp code
        DSP = await fwan.compileMonoNode(audio_context, "FaustDSP", faust, dsp_code, argv, (rendering_mode === "ScriptProcessor"), buffer_size);
        activateMonoDSP(DSP);
    }
}

function expandDSP(dsp_code) {
    // Prepare argv list, libraries are now included and loaded from the EMCC locale FS included in libfaust
    var argv = "-ftz " + ftz_flag.toString() + " -I libraries/";
    console.log(argv);

    return faust.expandDSP(dsp_code, argv);
}
