// @ts-check
/**
 * Faust live WASM demo bootstrapper.
 * Handles drag-and-drop compilation, configuration menus, and runtime state
 * for a lightweight Faust compiler showcase.
 */
import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url"
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url"
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url"
import { fetchText } from "./utils/network"
import { getStorageItemValue, setStorageItemValue } from "./utils/local-storage"

/** @type {typeof AudioContext} */
const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
const audio_context = new AudioContextConstructor({ latencyHint: 0.00001 });
audio_context.destination.channelInterpretation = "discrete";

const isWasm = typeof WebAssembly !== "undefined";
const workletAvailable = typeof AudioWorklet !== "undefined";

/** @type {HTMLDivElement} */
const faustUIRoot = document.getElementById("faust-ui");

/** @type {import("@grame//faustwasm").FaustCompiler} */
let faust_compiler = null;
/** @type {import("@grame//faustwasm").FaustMonoDspGenerator} */
let faust_mono_factory = null;
/** @type {import("@grame//faustwasm").FaustPolyDspGenerator} */
let faust_poly_factory = null;
/** @type {() => import("@grame//faustwasm").FaustMonoDspGenerator} */
let get_faust_mono_factory = null;
/** @type {() => import("@grame//faustwasm").FaustPolyDspGenerator} */
let get_faust_poly_factory = null;
let isPoly = false;
let buffer_size = 1024;
let audio_input = null;
/** @type {import("./faustwasm").FaustAudioWorkletNode<any> | import("./faustwasm").FaustScriptProcessorNode<any>} */
let DSP = null;
/** @type {string} */
let dsp_code = null;
/** @type {typeof import("./faust-ui/index").FaustUI} */
let FaustUI;
/** @type {import("./faust-ui/index").FaustUI} */
let faustUI;
let poly_flag = "OFF";
let ftz_flag = "2";
let sample_format = "float";
let poly_nvoices = 16;
let rendering_mode = "ScriptProcessor";

/**
 * Callback function passed to the DSP to handle parameter value changes
 * (e.g., from automation or sensors) and update the UI.
 * @param {string} path The UI path of the parameter.
 * @param {number} value The new value.
 */
let output_handler = (path, value) => faustUI.paramChangeByDSP(path, value);

/**
 * Sets the audio buffer size from a select element and recompiles the DSP.
 * Handles special cases for ScriptProcessor mode.
 * @param {HTMLSelectElement} bs_item The select element containing buffer size options.
 */
export const setBufferSize = (bs_item) => {
    if (!bs_item) {
        return;
    }
    buffer_size = parseInt(bs_item.options[bs_item.selectedIndex].value);
    if (buffer_size === 128 && rendering_mode === "ScriptProcessor") {
        console.log("buffer_size cannot be set to 128 in ScriptProcessor mode !");
        buffer_size = 256;
        restoreMenu("selectedBuffer", buffer_size.toString());
    }
    compileDSP();
}

/**
 * Sets the polyphonic mode ('ON'/'OFF') from a select element and recompiles the DSP.
 * @param {HTMLSelectElement} poly_item The select element for polyphony.
 */
export const setPoly = (poly_item) => {
    if (!poly_item) {
        return;
    }
    poly_flag = poly_item.options[poly_item.selectedIndex].value;
    compileDSP();
}

/**
 * Sets the number of polyphonic voices from a select element and recompiles the DSP.
 * @param {HTMLSelectElement} voices_item The select element for voice count.
 */
export const setPolyVoices = (voices_item) => {
    if (!voices_item) {
        return;
    }
    poly_nvoices = parseInt(voices_item.options[voices_item.selectedIndex].value);
    compileDSP();
}

/**
 * Sets the audio rendering mode (AudioWorklet or ScriptProcessor) from a select element.
 * Adjusts buffer size constraints accordingly and recompiles the DSP.
 * @param {HTMLSelectElement} rendering_item The select element for rendering mode.
 */
export const setRenderingMode = (rendering_item) => {
    if (!rendering_item) {
        return;
    }
    rendering_mode = rendering_item.options[rendering_item.selectedIndex].value;
    /** @type {HTMLSelectElement} */
    const selectedBuffer = document.getElementById("selectedBuffer");
    if (rendering_mode === "AudioWorklet") {
        buffer_size = 128;
        restoreMenu("selectedBuffer", buffer_size.toString());
        if (selectedBuffer) {
            selectedBuffer.disabled = true;
        }
    } else {
        buffer_size = 1024;
        restoreMenu("selectedBuffer", buffer_size.toString());
        if (selectedBuffer) {
            selectedBuffer.disabled = false;
        }
    }
    compileDSP();
}

/**
 * Sets the "Flush To Zero" (FTZ) optimization flag from a select element and recompiles the DSP.
 * @param {HTMLSelectElement} ftz_item The select element for FTZ level.
 */
export const setFTZ = (ftz_item) => {
    if (!ftz_item) {
        return;
    }
    ftz_flag = ftz_item.options[ftz_item.selectedIndex].value;
    compileDSP();
}

/**
 * Sets the audio sample format (e.g., 'float', 'int') from a select element and recompiles the DSP.
 * @param {HTMLSelectElement} sample_item The select element for sample format.
 */
export const setSampleFormat = (sample_item) => {
    if (!sample_item) {
        return;
    }
    sample_format = sample_item.options[sample_item.selectedIndex].value;
    compileDSP();
}

// MIDI input handling

/**
 * Sends a MIDI KeyOn message to the polyphonic DSP node.
 * @param {number} channel MIDI channel.
 * @param {number} pitch MIDI note number.
 * @param {number} velocity MIDI velocity (0-127).
 */
const keyOn = (channel, pitch, velocity) => {
    if (DSP && isPoly) {
        DSP.keyOn(channel, pitch, velocity);
    }
}

/**
 * Sends a MIDI KeyOff message to the polyphonic DSP node.
 * @param {number} channel MIDI channel.
 * @param {number} pitch MIDI note number.
 * @param {number} velocity MIDI velocity (0-127).
 */
const keyOff = (channel, pitch, velocity) => {
    if (DSP && isPoly) {
        DSP.keyOff(channel, pitch, velocity);
    }
}

/**
 * Sends a MIDI Pitch Wheel message to the DSP node.
 * @param {number} channel MIDI channel.
 * @param {number} bend Pitch bend value.
 */
const pitchWheel = (channel, bend) => {
    if (DSP) {
        DSP.pitchWheel(channel, bend);
    }
}

/**
 * Sends a MIDI Control Change (CC) message to the DSP node.
 * @param {number} channel MIDI channel.
 * @param {number} ctrl CC controller number.
 * @param {number} value CC value (0-127).
 */
const ctrlChange = (channel, ctrl, value) => {
    if (DSP) {
        DSP.ctrlChange(channel, ctrl, value);
    }
}

/**
 * Handles incoming MIDI messages from the Web MIDI API.
 * Parses the message and routes it to keyOn, keyOff, ctrlChange, or pitchWheel.
 * @param {MessageEvent} ev A MIDI message event.
 */
const midiMessageReceived = (ev) => {
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

    /*
    // Direct message
    if (DSP && isPoly) {
        DSP.midiMessage(ev.data);
    }
    */
}

/**
 * Error callback for `navigator.requestMIDIAccess`.
 * @param {Error} error The error object.
 */
const onerrorcallback = (error) => {
    console.log(error);
}

/**
 * Success callback for `navigator.requestMIDIAccess`.
 * Attaches listeners to all available MIDI input ports and handles device state changes.
 * @param {any} access The MIDIAccess object provided by the browser.
 */
const onsuccesscallbackStandard = (access) => {
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

    for (const input of access.inputs.values()) {
        input.onmidimessage = midiMessageReceived;
        console.log(input.name + " is connected");
    }
}

/**
 * Requests access to the user's MIDI devices using the Web MIDI API.
 */
const activateMIDIInput = () => {
    console.log("activateMIDIInput");
    if (typeof (navigator.requestMIDIAccess) !== "undefined") {
        navigator.requestMIDIAccess().then(onsuccesscallbackStandard, onerrorcallback);
    } else {
        alert("MIDI input cannot be activated, either your browser still does't have it, or you need to explicitly activate it.");
    }
}

/** Audio input handling */
/**
 * Requests access to the user's audio input (microphone) using `getUserMedia`.
 */
const activateAudioInput = () => {
    console.log("activateAudioInput");
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } })
            .then(getDevice)
            .catch((e) => {
                alert('Error getting audio input');
                console.log(e);
                audio_input = null;
            });
    } else {
        alert('Audio input API not available');
    }
}

/**
 * Success callback for `getUserMedia`.
 * Creates an AudioNode from the media stream and connects it to the DSP.
 * @param {MediaStream} device The user's audio input stream.
 */
const getDevice = (device) => {
    // Create an AudioNode from the stream.
    audio_input = audio_context.createMediaStreamSource(device);

    // Connect it to the destination.
    audio_input.connect(DSP);
}

/**
 * Enables or disables saving settings to Local Storage based on a checkbox state.
 * @param {boolean} state The desired state (true for 'on', false for 'off').
 */
export const setLocalStorage = (state) => {
    console.log(state);
    setStorageItemValue('FaustLibTester', 'FaustLocalStorage', ((state) ? "on" : "off"));
}

/**
 * Save/Load functions using local storage
 * * Restores the selected option of a dropdown menu (select element) to a given value.
 * @param {string} id The ID of the select element.
 * @param {string} value The value to select.
 */
const restoreMenu = (id, value) => {
    /** @type {HTMLSelectElement} */
    const menu = document.getElementById(id);
    for (let i = 0; i < menu.length; i++) {
        // Weak comparison here
        if (menu.options[i].value == value) {
            menu.selectedIndex = i;
            break;
        }
    }
}

/**
 * Saves all current DSP parameter values to Local Storage.
 */
const saveDSPState = () => {
    var params = DSP.getParams();
    for (var i = 0; i < params.length; i++) {
        setStorageItemValue('DSP', params[i], DSP.getParamValue(params[i]).toString());
    }
}

/**
 * Loads all DSP parameter values from Local Storage and applies them
 * to both the DSP node and the Faust UI.
 */
const loadDSPState = () => {
    var params = DSP.getParams();
    for (var i = 0; i < params.length; i++) {
        var value = getStorageItemValue('DSP', params[i]);
        if (value) {
            // Restore DSP state
            DSP.setParamValue(params[i], Number(value));
            // Restore GUI state
            output_handler(params[i], Number(value));
        }
    }
}

/**
 * Saves the main page configuration (buffer size, polyphony, FTZ, etc.)
 * to Local Storage, if enabled.
 */
const savePageState = () => {
    if (getStorageItemValue('FaustLibTester', 'FaustLocalStorage') === "on") {
        setStorageItemValue('FaustLibTester', 'buffer_size', buffer_size);
        setStorageItemValue('FaustLibTester', 'poly_flag', poly_flag);
        setStorageItemValue('FaustLibTester', 'ftz_flag', ftz_flag);
        setStorageItemValue('FaustLibTester', 'sample_format', sample_format);
        setStorageItemValue('FaustLibTester', 'poly_nvoices', poly_nvoices);
        setStorageItemValue('FaustLibTester', 'rendering_mode', rendering_mode);
    }
}

/**
 * Loads the main page configuration from Local Storage (if enabled)
 * and restores the state of the UI menus.
 */
const loadPageState = () => {
    if (getStorageItemValue('FaustLibTester', 'FaustLocalStorage') === "on") {
        const storedBuffer = getStorageItemValue('FaustLibTester', 'buffer_size');
        buffer_size = Number(storedBuffer ?? 256);
        if (!Number.isFinite(buffer_size) || buffer_size <= 0) {
            buffer_size = 256;
        }

        poly_flag = String(getStorageItemValue('FaustLibTester', 'poly_flag') ?? "OFF").toUpperCase();

        const storedVoices = getStorageItemValue('FaustLibTester', 'poly_nvoices');
        poly_nvoices = Number(storedVoices ?? 16);
        if (!Number.isFinite(poly_nvoices) || poly_nvoices <= 0) {
            poly_nvoices = 16;
        }

        ftz_flag = String(getStorageItemValue('FaustLibTester', 'ftz_flag') ?? "2");
        sample_format = String(getStorageItemValue('FaustLibTester', 'sample_format') ?? "float");
        rendering_mode = String(getStorageItemValue('FaustLibTester', 'rendering_mode') ?? "ScriptProcessor");

        // Restore menus
        restoreMenu("selectedBuffer", buffer_size.toString());
        restoreMenu("selectedPoly", poly_flag);
        restoreMenu("polyVoices", poly_nvoices.toString());
        restoreMenu("selectedFTZ", ftz_flag);
        restoreMenu("selectedSampleFormat", sample_format);
        restoreMenu("selectedRenderingMode", rendering_mode);

        if (rendering_mode === "AudioWorklet") {
            document.getElementById("selectedBuffer").disabled = true;
        }
    }
}

/**
 * Handles drag-and-drop hover events to toggle a "hover" class for visual feedback.
 * @param {DragEvent | InputEvent} e The drag event.
 */
const fileDragHover = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const dropZone = document.getElementById("filedrag");
    if (dropZone) {
        dropZone.classList.toggle("hover", e.type === "dragover");
    }
}

/**
 * Checks if a given string is a non-file URL.
 * @param {string} value The URL or string to check.
 * @returns {boolean} True if the value is a non-file URL, false otherwise.
 */
const isExternalUrl = (value) => Boolean(value) && !value.toLowerCase().startsWith("file:");

/**
 * Reads a `File` object as a text string using FileReader.
 * @param {File} file The file to read.
 * @returns {Promise<string>} A promise that resolves with the file's text content.
 */
const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsText(file);
});

/**
 * Resolves Faust code from a drop or input event.
 * Can handle external URLs, inline text, or dropped/selected files.
 * @param {DragEvent | InputEvent} event The browser event.
 * @returns {Promise<string|null>} A promise that resolves with the Faust code, or null.
 */
const resolveCodeFromEvent = async (event) => {
    if (!isWasm) {
        alert("WebAssembly is not supported in this browser !");
        return null;
    }

    const dataTransfer = "dataTransfer" in event ? event.dataTransfer : null;
    if (dataTransfer) {
        const url = dataTransfer.getData("URL");
        if (isExternalUrl(url)) {
            try {
                return await fetchText(url, { mode: "cors" });
            } catch (error) {
                alert(error?.message ?? String(error));
                throw error;
            }
        }

        const inlineCode = dataTransfer.getData("text");
        if (inlineCode) {
            return inlineCode;
        }

        if (dataTransfer.files && dataTransfer.files.length > 0) {
            return await readFileAsText(dataTransfer.files[0]);
        }
    }

    const target = event.target;
    if (target && "files" in target && target.files && target.files.length > 0) {
        return await readFileAsText(target.files[0]);
    }

    return null;
}

/**
 * Checks if a DSP's JSON UI definition appears to be polyphonic
 * by looking for standard parameters (freq, gate, gain).
 * Issues an alert if they are missing.
 * @param {string} json The JSON UI definition as a string.
 */
const checkPolyphonicDSP = (json) => {
    const content = String(json ?? "");
    const hasFreqOrKey = content.includes("/freq") || content.includes("/key");
    const hasGain = content.includes("/gain") || content.includes("/vel") || content.includes("/velocity");
    const hasGate = content.includes("/gate");
    if (!(hasFreqOrKey && hasGain && hasGate)) {
        alert("Faust DSP code is not Polyphonic, it will probably not work correctly in this mode...");
    }
}

/**
 * Stops and destroys the current DSP node, disconnects it from the audio graph,
 * and clears the Faust UI.
 */
const deleteDSP = () => {
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

/**
 * Configures and activates a compiled monophonic DSP node.
 * Connects audio input if needed, sets up the UI, and connects to the destination.
 * @param {any} dsp The DSP node instance to activate.
 */
const activateMonoDSP = (dsp) => {
    if (!dsp) {
        alert(faust_compiler.getErrorMessage());
        return;
    }

    DSP = dsp;
    if (DSP.getNumInputs() > 0) {
        activateAudioInput();
    } else {
        audio_input = null;
    }

    // Setup UI
    DSP.startSensors();
    faustUI = new FaustUI({ ui: DSP.getUI(), root: faustUIRoot });
    faustUI.paramChangeByUI = (path, value) => DSP.setParamValue(path, value);
    DSP.setOutputParamHandler(output_handler);
    console.log("Inputs = " + DSP.getNumInputs());
    console.log("Outputs = " + DSP.getNumOutputs());
    //DSP.metadata({ declare: function(key, value) { console.log("key = " + key + " value = " + value); }});
    DSP.connect(audio_context.destination);
    // DSP has to be explicitly started
    DSP.start();
    loadDSPState();
}

/**
 * Configures and activates a compiled polyphonic DSP node.
 * Connects audio input if needed, sets up the UI, and connects to the destination.
 * @param {any} dsp The DSP node instance to activate.
 */
const activatePolyDSP = (dsp) => {
    if (!dsp) {
        alert(faust_compiler.getErrorMessage());
        return;
    }
    checkPolyphonicDSP(dsp.getJSON());

    DSP = dsp;
    if (DSP.getNumInputs() > 0) {
        activateAudioInput();
    } else {
        audio_input = null;
    }

    // Setup UI
    DSP.startSensors();
    faustUI = new FaustUI({ ui: DSP.getUI(), root: faustUIRoot });
    faustUI.paramChangeByUI = (path, value) => DSP.setParamValue(path, value);
    DSP.setOutputParamHandler(output_handler);
    console.log("Inputs = " + DSP.getNumInputs());
    console.log("Outputs = " + DSP.getNumOutputs());
    //DSP.metadata({ declare: function(key, value) { console.log("key = " + key + " value = " + value); }});
    DSP.connect(audio_context.destination);
    // DSP has to be explicitly started
    DSP.start();
    loadDSPState();
}

/**
 * Compiles the current `dsp_code` string.
 * This function deletes any existing DSP, prepares compiler arguments (argv)
 * based on page settings, compiles as mono or poly, and calls the
 * appropriate activation function.
 */
const compileDSP = async () => {
    if (!dsp_code) {
        return;
    }

    deleteDSP();

    // Prepare argv list
    var argv = "-ftz " + ftz_flag.toString() + " -" + sample_format;
    console.log(argv);

    if (poly_flag === "ON") {
        isPoly = true;
        console.log("Poly DSP");
        faust_poly_factory = get_faust_poly_factory();
        await faust_poly_factory.compile(faust_compiler, "FaustDSP", dsp_code, argv);
        DSP = await faust_poly_factory.createNode(audio_context, poly_nvoices, undefined, undefined, undefined, undefined, (rendering_mode === "ScriptProcessor"), buffer_size);
        activatePolyDSP(DSP);
    } else {
        isPoly = false;
        console.log("Mono DSP");
        faust_mono_factory = get_faust_mono_factory();
        await faust_mono_factory.compile(faust_compiler, "FaustDSP", dsp_code, argv);
        DSP = await faust_mono_factory.createNode(audio_context, undefined, undefined, (rendering_mode === "ScriptProcessor"), buffer_size);
        activateMonoDSP(DSP);
    }
}

/**
 * Handle a drop/input event by reading Faust code and recompiling the DSP.
 * @param {DragEvent | InputEvent} event The file drop or input change event.
 */
const uploadFile = async (event) => {
    fileDragHover(event);
    try {
        const code = await resolveCodeFromEvent(event);
        if (code) {
            dsp_code = code;
            await compileDSP();
        } else {
            window.alert("This object is not Faust code...");
        }
    } catch (error) {
        console.error(error);
    }
}

/**
 * Attaches 'change' event listeners to all configuration dropdowns
 * (buffer, poly, voices, etc.) and the local storage checkbox.
 */
const wireConfigMenus = () => {
    /**
     * Helper to find a select element by ID and attach a change handler.
     * @param {string} id The element ID.
     * @param {(el: HTMLSelectElement) => void} handler The callback function.
     */
    const bindSelect = (id, handler) => {
        const element = document.getElementById(id);
        if (element instanceof HTMLSelectElement) {
            element.addEventListener("change", () => handler(element));
        }
    };

    bindSelect("selectedBuffer", setBufferSize);
    bindSelect("selectedPoly", setPoly);
    bindSelect("polyVoices", setPolyVoices);
    bindSelect("selectedRenderingMode", setRenderingMode);
    bindSelect("selectedSampleFormat", setSampleFormat);
    bindSelect("selectedFTZ", setFTZ);

    const localStorageCheckbox = document.getElementById("localstorage");
    if (localStorageCheckbox instanceof HTMLInputElement) {
        localStorageCheckbox.addEventListener("change", () => setLocalStorage(localStorageCheckbox.checked));
    }
}

/**
 * Initializes the page state on load.
 * Restores the 'localstorage' checkbox state and loads all other
 * page settings (buffer, poly, etc.) from Local Storage.
 */
const initPage = () => {
    // Restore 'save' checkbox state
    const storageToggle = document.getElementById("localstorage");
    if (storageToggle instanceof HTMLInputElement) {
        const enabled = (getStorageItemValue('FaustLibTester', 'FaustLocalStorage') === "on");
        storageToggle.checked = enabled;
        setLocalStorage(enabled);
    }

    // Load page state
    loadPageState();
}

/**
 * Main asynchronous initialization function.
 * Loads and instantiates the Faust WASM module, compiler, and UI library.
 * Sets up MIDI and drag-and-drop listeners.
 */
const init = async () => {
    const {
        instantiateFaustModuleFromFile,
        FaustCompiler,
        FaustMonoDspGenerator,
        FaustPolyDspGenerator,
        LibFaust
    } = await import("@grame/faustwasm");
    FaustUI = (await import("@shren/faust-ui")).FaustUI;
    // Init Faust compiler and node factory 
    const module = await instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL);
    // const module = await instantiateFaustModule();
    const libFaust = new LibFaust(module);
    faust_compiler = new FaustCompiler(libFaust);
    get_faust_mono_factory = () => new FaustMonoDspGenerator();
    get_faust_poly_factory = () => new FaustPolyDspGenerator();

    // Check AudioWorklet support
    if (!workletAvailable) {
        document.getElementById("selectedRenderingMode").disabled = true;
        alert("AudioWorklet is not supported, ScriptProcessor model only will be available");
    }

    activateMIDIInput();

    const filedrag1 = document.getElementById("filedrag");
    filedrag1.addEventListener("dragover", fileDragHover, false);
    filedrag1.addEventListener("dragleave", fileDragHover, false);
    filedrag1.addEventListener("drop", uploadFile, false);
    filedrag1.textContent = "Drop a Faust .dsp file or URL here (compiled using libfaust version " + faust_compiler.version() + ")";
}

wireConfigMenus();

// Init page
initPage();

// Timer to save page and DSP state to local storage
setInterval(() => { savePageState(); if (DSP) { saveDSPState(); } }, 1000);

// Init Faust part
init();

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

// On desktop
window.addEventListener("mousedown", () => {
    if (audio_context.state !== "suspended") return;
    audio_context.resume().then(() => console.log("Audio resumed"))
});