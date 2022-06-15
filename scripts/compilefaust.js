"use strict";

var isWebKitAudio = (typeof (webkitAudioContext) !== "undefined");
var isWasm = (typeof (WebAssembly) !== "undefined");
var isPoly = false;

if (!isWasm) {
    alert("WebAssembly is not supported in this browser, the page will not work !")
}

var audio_context = (isWebKitAudio) ? new webkitAudioContext({ latencyHint: 0.00001 }) : new AudioContext({ latencyHint: 0.00001 });
audio_context.destination.channelInterpretation = "discrete";
// To enable multi-channels inputs/outputs
audio_context.destination.channelCount = audio_context.destination.maxChannelCount;

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
/*
function checkFactoryStack(factory) {
    if (factory && factory_stack.indexOf(factory) === -1) {
        factory_stack.push(factory);
        if (factory_stack.length >= 10) {
            faust.deleteDSPFactory(factory_stack.shift());
        }
    }
}
*/
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
        output_handler = _f4u$t.main(DSP.getJSON(), $(faust_svg), function (path, val) { DSP.setParamValue(path, +val); });
        DSP.setOutputParamHandler(output_handler);
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

async function compileDSP() {
    deleteDSP();

    // Prepare argv list
    var argv = [];
    argv.push("-ftz");
    argv.push(ftz_flag);
    // argv.push("-I");
    // Libraries are now included and loaded from the EMCC locale FS included in libfaust
    // argv.push("libraries");
    console.log(argv);

    if (poly_flag === "ON") {
        isPoly = true;
        console.log("Poly DSP");
        // Create a poly DSP factory from the dsp code
        try {
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
            const { factory } = await faust_mono_factory.compile(faust_compiler, "FaustDSP", dsp_code, argv.join(" "));
            compileMonoDSP(factory);
        } catch (error) {
            alert(error);
            // Fix me
            document.getElementById('faustuiwrapper').style.display = 'none';
        }
    }
}

function expandDSP(dsp_code) {
    // Prepare argv list
    var argv = [];
    argv.push("-ftz");
    argv.push(ftz_flag);
    // argv.push("-I");
    // Libraries are now included and loaded from the EMCC locale FS included in libfaust
    // argv.push("libraries");
    console.log(argv);

    return faust_compiler.expandDSP(dsp_code, argv.join(" "));
}
