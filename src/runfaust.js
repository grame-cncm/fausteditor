/**
 * Faust Editor runtime configuration helpers.
 * Manages buffer sizes, MIDI routing, audio input capture, and local storage.
 */

import { audio_context, DSP, isPoly, output_handler } from "./compilefaust";
import { codeEditor } from "./faustlive";
import { getStorageItemValue, setStorageItemValue } from "./utils/local-storage";

export var buffer_size = 1024;
export var audio_input = null;
export function resetAudioInput() { audio_input = null; }
export var poly_flag = "OFF";
export var ftz_flag = "2";
export var sample_format = "float";
export var poly_nvoices = 16;
export var rendering_mode = "ScriptProcessor";

/**
 * Update the processing buffer size from the configuration menu.
 * @param {HTMLSelectElement} bs_item
 */
export function setBufferSize(bs_item) {
    buffer_size = parseInt(bs_item.options[bs_item.selectedIndex].value);
    if (buffer_size === 128 && rendering_mode === "ScriptProcessor") {
        console.log("buffer_size cannot be set to 128 in ScriptProcessor mode !");
        buffer_size = 1024;
        restoreMenu("selectedBuffer", buffer_size);
    }
    console.log("setBufferSize", buffer_size);
}

/**
 * Toggle polyphonic mode based on user selection.
 * @param {HTMLSelectElement} poly_item
 */
export function setPoly(poly_item) {
    poly_flag = poly_item.options[poly_item.selectedIndex].value;
    console.log("setPoly", poly_flag);
}

/**
 * Adjust the number of polyphonic voices.
 * @param {HTMLSelectElement} voices_item
 */
export function setPolyVoices(voices_item) {
    poly_nvoices = parseInt(voices_item.options[voices_item.selectedIndex].value, 10);
    console.log("setPolyVoices", poly_nvoices);
}

// TODO(ijc): Unused?
/**
 * Update the flush-to-zero compiler flag.
 * @param {HTMLSelectElement} ftz_item
 */
export function setFTZ(ftz_item) {
    ftz_flag = ftz_item.options[ftz_item.selectedIndex].value;
}

/**
 * Change the audio rendering backend between ScriptProcessor and AudioWorklet.
 * @param {HTMLSelectElement} rendering_item
 */
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

/**
 * Switch the sample format compiler option.
 * @param {HTMLSelectElement} sample_item
 */
export function setSampleFormat(sample_item) {
    sample_format = sample_item.options[sample_item.selectedIndex].value;
    console.log("setSampleFormat", sample_format);
}

// MIDI input handling
/**
 * Forward a MIDI note-on event to the DSP node.
 * @param {number} channel
 * @param {number} pitch
 * @param {number} velocity
 */
function keyOn(channel, pitch, velocity) {
    if (DSP) {
        DSP.keyOn(channel, pitch, velocity);
    }
}

/**
 * Forward a MIDI note-off event to the DSP node.
 * @param {number} channel
 * @param {number} pitch
 * @param {number} velocity
 */
function keyOff(channel, pitch, velocity) {
    if (DSP) {
        DSP.keyOff(channel, pitch, velocity);
    }
}

/**
 * Forward pitch bend data to the DSP node.
 * @param {number} channel
 * @param {number} bend
 */
function pitchWheel(channel, bend) {
    if (DSP) {
        DSP.pitchWheel(channel, bend);
    }
}

/**
 * Forward a MIDI control change event to the DSP node.
 * @param {number} channel
 * @param {number} ctrl
 * @param {number} value
 */
function ctrlChange(channel, ctrl, value) {
    if (DSP) {
        DSP.ctrlChange(channel, ctrl, value);
    }
}

/**
 * Decode incoming MIDI messages and dispatch them to the DSP helpers.
 * @param {MessageEvent} ev
 */
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

/**
 * Log a Web MIDI API failure.
 * @param {unknown} error
 */
function onerrorcallback(error) {
    console.log(error);
}

/**
 * Register listeners on all available MIDI inputs.
 * @param {WebMidi.MIDIAccess} access
 */
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

/**
 * Enable Web MIDI input when supported by the browser.
 */
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
const audioConstraints = {
    audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
};

/**
 * Handle audio-capture failures triggered while requesting microphone access.
 * @param {unknown} error
 */
function handleAudioInputError(error) {
    alert('Error getting audio input');
    console.log(error);
    audio_input = null;
}

/**
 * Attach the captured audio stream to the DSP node.
 * @param {MediaStream} device
 */
function attachAudioInput(device) {
    // Create an AudioNode from the stream.
    audio_input = audio_context.createMediaStreamSource(device);

    // Connect it to the destination.
    audio_input.connect(DSP);
}

/**
 * Request audio input access from the browser and attach it to the DSP node.
 */
export async function activateAudioInput() {
    console.log("activateAudioInput");
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            attachAudioInput(stream);
            return;
        } catch (error) {
            handleAudioInputError(error);
            return;
        }
    }

    const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (legacyGetUserMedia) {
        legacyGetUserMedia.call(navigator, audioConstraints, attachAudioInput, handleAudioInputError);
    } else {
        alert('Audio input API not available');
    }
}

// Save/Load functions using local storage

/**
 * Persist the local storage toggle state.
 * @param {boolean} state
 */
export function setLocalStorage(state) {
    console.log(state);
    setStorageItemValue('FaustEditor', 'FaustLocalStorage', ((state) ? "on" : "off"));
}

/**
 * Persist whether DSP parameter values should be stored.
 * @param {boolean} state
 */
export function setDSPStorage(state) {
    console.log(state);
    setStorageItemValue('FaustEditor', 'FaustDSPStorage', ((state) ? "on" : "off"));
}

/**
 * Persist whether the DSP source should be stored in local storage.
 * @param {boolean} state
 */
export function setSourceStorage(state) {
    console.log(state);
    setStorageItemValue('FaustEditor', 'FaustSourceStorage', ((state) ? "on" : "off"));
}

/**
 * Update a select element to reflect a stored value.
 * @param {string} id
 * @param {string|number} value
 */
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

/**
 * Store current DSP parameter values when DSP storage is enabled.
 */
export function saveDSPState() {
    if (getStorageItemValue('FaustEditor', 'FaustDSPStorage') === "on") {
        var params = DSP.getParams();
        for (var i = 0; i < params.length; i++) {
            setStorageItemValue('FaustEditor', params[i], DSP.getParamValue(params[i]));
        }
    }
}

/**
 * Restore DSP parameter values from local storage.
 */
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

/**
 * Persist the current editor configuration to local storage.
 */
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

/**
 * Sync configuration menus with the in-memory runtime state.
 */
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

/**
 * Restore runtime configuration and optionally source code from local storage.
 */
export function loadPageState() {
    if (getStorageItemValue('FaustEditor', 'FaustLocalStorage') === "on") {

        buffer_size = Number(getStorageItemValue('FaustEditor', 'buffer_size') ?? 1024);
        if (!buffer_size) {
            buffer_size = 1024;
        }
        poly_flag = getStorageItemValue('FaustEditor', 'poly_flag') ?? "OFF";
        poly_nvoices = Number(getStorageItemValue('FaustEditor', 'poly_nvoices') ?? 16);
        if (!poly_nvoices) {
            poly_nvoices = 16;
        }
        ftz_flag = getStorageItemValue('FaustEditor', 'ftz_flag') ?? 2;
        rendering_mode = getStorageItemValue('FaustEditor', 'rendering_mode') ?? "ScriptProcessor";
        sample_format = getStorageItemValue('FaustEditor', 'sample_format') ?? "float";

        // Possibly restore DSP source
        if (getStorageItemValue('FaustEditor', 'FaustSourceStorage') === "on" && getStorageItemValue('FaustEditor', 'dsp_code')) {
            codeEditor.setValue(getStorageItemValue('FaustEditor', 'dsp_code'));
        }

        restoreMenus();
    }
}

/**
 * Validate that a DSP JSON description contains polyphonic controls.
 * @param {string} json
 */
export function checkPolyphonicDSP(json) {
    const hasFreqOrKey = json.includes("/freq") || json.includes("/key");
    const hasGainOrVel = json.includes("/gain") || json.includes("/vel");
    const hasGate = json.includes("/gate");
    if (!(hasFreqOrKey && hasGainOrVel && hasGate)) {
        alert("The Faust DSP code is missing required polyphonic parameters. It may not function correctly in polyphonic mode.");
    }
}
