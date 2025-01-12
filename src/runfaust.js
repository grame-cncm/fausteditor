import { audio_context, DSP, isPoly, output_handler } from "./compilefaust";
import { codeEditor } from "./faustlive";
import { getStorageItemValue, setStorageItemValue } from "./localStorage";

export var buffer_size = 1024;
export var audio_input = null;
export function resetAudioInput() { audio_input = null; }
export var poly_flag = "OFF";
export var ftz_flag = "2";
export var sample_format = "float";
export var poly_nvoices = 16;
export var rendering_mode = "ScriptProcessor";

export function setBufferSize(bs_item) {
    buffer_size = parseInt(bs_item.options[bs_item.selectedIndex].value);
    if (buffer_size === 128 && rendering_mode === "ScriptProcessor") {
        console.log("buffer_size cannot be set to 128 in ScriptProcessor mode !");
        buffer_size = 1024;
        restoreMenu("selectedBuffer", buffer_size);
    }
    console.log("setBufferSize", buffer_size);
}

export function setPoly(poly_item) {
    poly_flag = poly_item.options[poly_item.selectedIndex].value;
    console.log("setPoly", poly_flag);
}

export function setPolyVoices(voices_item) {
    poly_nvoices = voices_item.options[voices_item.selectedIndex].value;
    console.log("setPolyVoices", poly_nvoices);
}

// TODO(ijc): Unused?
export function setFTZ(ftz_item) {
    ftz_flag = ftz_item.options[ftz_item.selectedIndex].value;
}

export function setRenderingMode(rendering_item) {
    rendering_mode = rendering_item.options[rendering_item.selectedIndex].value;
    if (rendering_mode === "AudioWorklet") {
        console.log("setRenderingMode AudioWorklet");
        buffer_size = 128;
        restoreMenu("selectedBuffer", buffer_size);
        document.getElementById("selectedBuffer").disabled = true;
    } else {
        buffer_size = 1024;
        restoreMenu("selectedBuffer", buffer_size);
        document.getElementById("selectedBuffer").disabled = false;
    }
}

export function setSampleFormat(sample_item) {
    sample_format = sample_item.options[sample_item.selectedIndex].value;
    console.log("setSampleFormat", sample_format);
}

// MIDI input handling
function keyOn(channel, pitch, velocity) {
    if (DSP && isPoly) {
        DSP.keyOn(channel, pitch, velocity);
    }
}

function keyOff(channel, pitch, velocity) {
    if (DSP && isPoly) {
        DSP.keyOff(channel, pitch, velocity);
    }
}

function pitchWheel(channel, bend) {
    if (DSP) {
        DSP.pitchWheel(channel, bend);
    }
}

function ctrlChange(channel, ctrl, value) {
    if (DSP) {
        DSP.ctrlChange(channel, ctrl, value);
    }
}

function midiMessageReceived(ev) {
    var cmd = ev.data[0] >> 4;
    var channel = ev.data[0] & 0xf;
    var data1 = ev.data[1];
    var data2 = ev.data[2];

    if (channel === 9) {
        return;
    } else if (cmd === 8 || ((cmd === 9) && (data2 === 0))) {
        keyOff(channel, data1, data2);
    } else if (cmd === 9) {
        keyOn(channel, data1, data2);
    } else if (cmd === 11) {
        ctrlChange(channel, data1, data2);
    } else if (cmd === 14) {
        pitchWheel(channel, (data2 * 128.0 + data1));
    }
}

function onerrorcallback(error) {
    console.log(error);
}

function onsuccesscallbackStandard(access) {
    access.onstatechange = function (e) {
        if (e.port.type === "input") {
            if (e.port.state === "connected") {
                console.log(e.port.name + " is connected");
                e.port.onmidimessage = midiMessageReceived;
            } else if (e.port.state === "disconnected") {
                console.log(e.port.name + " is disconnected");
                e.port.onmidimessage = null;
            }
        }
    }

    for (var input of access.inputs.values()) {
        input.onmidimessage = midiMessageReceived;
        console.log(input.name + " is connected");
    }
}

export function activateMIDIInput() {
    console.log("activateMIDIInput");
    if (typeof (navigator.requestMIDIAccess) !== "undefined") {
        navigator.requestMIDIAccess().then(onsuccesscallbackStandard, onerrorcallback);
    } else {
        alert(
            "MIDI input cannot be activated, either your browser still does't have it, or you need to explicitly activate it."
        );
    }
}

// Audio input handling
export function activateAudioInput() {
    console.log("activateAudioInput");
    if (!navigator.getUserMedia) {
        navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    }

    if (navigator.getUserMedia) {
        navigator.getUserMedia({
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
        }, getDevice, function (e) {
            alert('Error getting audio input');
            console.log(e);
            audio_input = null;
        });
    } else {
        alert('Audio input API not available');
    }
}

function getDevice(device) {
    // Create an AudioNode from the stream.
    audio_input = audio_context.createMediaStreamSource(device);

    // Connect it to the destination.
    audio_input.connect(DSP);
}

// Save/Load functions using local storage

export function setLocalStorage(state) {
    console.log(state);
    setStorageItemValue('FaustEditor', 'FaustLocalStorage', ((state) ? "on" : "off"));
}

export function setDSPStorage(state) {
    console.log(state);
    setStorageItemValue('FaustEditor', 'FaustDSPStorage', ((state) ? "on" : "off"));
}

export function setSourceStorage(state) {
    console.log(state);
    setStorageItemValue('FaustEditor', 'FaustSourceStorage', ((state) ? "on" : "off"));
}

function restoreMenu(id, value) {
    if (document.getElementById(id)) {
        for (var i = 0; i < document.getElementById(id).length; i++) {
            // Weak comparison here
            if (document.getElementById(id).options[i].value == value) {
                document.getElementById(id).selectedIndex = i;
                break;
            }
        }
    }
}

export function saveDSPState() {
    if (getStorageItemValue('FaustEditor', 'FaustDSPStorage') === "on") {
        var params = DSP.getParams();
        for (var i = 0; i < params.length; i++) {
            setStorageItemValue('FaustEditor', params[i], DSP.getParamValue(params[i]));
        }
    }
}

export function loadDSPState() {
    if (getStorageItemValue('FaustEditor', 'FaustDSPStorage') === "on") {
        var params = DSP.getParams();
        for (var i = 0; i < params.length; i++) {
            var value = getStorageItemValue('FaustEditor', params[i]);
            if (value) {
                // Restore DSP state
                DSP.setParamValue(params[i], Number(value));
                // Restore GUI state
                output_handler(params[i], Number(value));
            }
        }
    }
}

export function savePageState() {
    if (getStorageItemValue('FaustEditor', 'FaustLocalStorage') === "on") {
        setStorageItemValue('FaustEditor', 'buffer_size', buffer_size);
        setStorageItemValue('FaustEditor', 'poly_flag', poly_flag);
        setStorageItemValue('FaustEditor', 'ftz_flag', ftz_flag);
        setStorageItemValue('FaustEditor', 'poly_nvoices', poly_nvoices);
        setStorageItemValue('FaustEditor', 'rendering_mode', rendering_mode);
        setStorageItemValue('FaustEditor', 'sample_format', sample_format);

        // Possibly save DSP source
        if (getStorageItemValue('FaustEditor', 'FaustSourceStorage') === "on") {
            setStorageItemValue('FaustEditor', 'dsp_code', codeEditor.getValue());
        }
    }
}

export function restoreMenus() {
    // Restore menus
    restoreMenu("selectedBuffer", buffer_size);
    restoreMenu("selectedPoly", poly_flag);
    restoreMenu("polyVoices", poly_nvoices);
    restoreMenu("selectedFTZ", ftz_flag);
    restoreMenu("selectedRenderingMode", rendering_mode);
    restoreMenu("selectedSampleFormat", sample_format);

    if (rendering_mode === "AudioWorklet") {
        document.getElementById("selectedBuffer").disabled = true;
        buffer_size = 128;
        restoreMenu("selectedBuffer", buffer_size);
    }
}

export function loadPageState() {
    if (getStorageItemValue('FaustEditor', 'FaustLocalStorage') === "on") {

        buffer_size = (getStorageItemValue('FaustEditor', 'buffer_size') ? getStorageItemValue('FaustEditor', 'buffer_size') : 1024);
        poly_flag = (getStorageItemValue('FaustEditor', 'poly_flag') ? getStorageItemValue('FaustEditor', 'poly_flag') : "OFF");
        poly_nvoices = (getStorageItemValue('FaustEditor', 'poly_nvoices') ? getStorageItemValue('FaustEditor', 'poly_nvoices') : 16);
        ftz_flag = (getStorageItemValue('FaustEditor', 'ftz_flag') ? getStorageItemValue('FaustEditor', 'ftz_flag') : 2);
        rendering_mode = (getStorageItemValue('FaustEditor', 'rendering_mode') ? getStorageItemValue('FaustEditor', 'rendering_mode') : "ScriptProcessor");
        sample_format = (getStorageItemValue('FaustEditor', 'sample_format') ? getStorageItemValue('FaustEditor', 'sample_format') : "float");

        // Possibly restore DSP source
        if (getStorageItemValue('FaustEditor', 'FaustSourceStorage') === "on" && getStorageItemValue('FaustEditor', 'dsp_code')) {
            codeEditor.setValue(getStorageItemValue('FaustEditor', 'dsp_code'));
        }

        restoreMenus();
    }
}

export function checkPolyphonicDSP(json) {
    if (!((json.indexOf("/freq") !== -1)
        && (json.indexOf("/gain") !== -1)
        && (json.indexOf("/gate") !== -1))) {
        alert("Faust DSP code is not Polyphonic, it will probably not work correctly in this mode...");
    }
}
