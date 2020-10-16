"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var Faust;
(function (Faust) {
    class BaseDSPImp {
        constructor(buffer_size) {
            this.fOutputHandler = null;
            this.fComputeHandler = null;
            this.fCachedEvents = [];
            this.fBufferNum = 0;
            this.fPlotHandler = null;
            this.fBufferSize = buffer_size;
            this.fInChannels = [];
            this.fOutChannels = [];
            this.gPtrSize = 4;
            this.gSampleSize = 4;
            this.fOutputsTimer = 5;
            this.fInputsItems = [];
            this.fOutputsItems = [];
            this.fPitchwheelLabel = [];
            this.fCtrlLabel = new Array(128).fill(null).map(() => []);
            this.fPathTable = {};
            this.fDestroyed = false;
            this.fUICallback = (item) => {
                if (item.type === "hbargraph" || item.type === "vbargraph") {
                    this.fOutputsItems.push(item.address);
                    this.fPathTable[item.address] = item.index;
                }
                else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
                    this.fInputsItems.push(item.address);
                    this.fPathTable[item.address] = item.index;
                    if (!item.meta)
                        return;
                    item.meta.forEach((meta) => {
                        const { midi } = meta;
                        if (!midi)
                            return;
                        const strMidi = midi.trim();
                        if (strMidi === "pitchwheel") {
                            this.fPitchwheelLabel.push({ path: item.address, min: item.min, max: item.max });
                        }
                        else {
                            const matched = strMidi.match(/^ctrl\s(\d+)/);
                            if (!matched)
                                return;
                            this.fCtrlLabel[parseInt(matched[1])].push({ path: item.address, min: item.min, max: item.max });
                        }
                    });
                }
            };
        }
        static remap(v, mn0, mx0, mn1, mx1) {
            return (v - mn0) / (mx0 - mn0) * (mx1 - mn1) + mn1;
        }
        static parseUI(ui, callback) {
            ui.forEach(group => BaseDSPImp.parseGroup(group, callback));
        }
        static parseGroup(group, callback) {
            if (group.items) {
                BaseDSPImp.parseItems(group.items, callback);
            }
        }
        static parseItems(items, callback) {
            items.forEach(item => BaseDSPImp.parseItem(item, callback));
        }
        static parseItem(item, callback) {
            if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
                BaseDSPImp.parseItems(item.items, callback);
            }
            else {
                callback(item);
            }
        }
        updateOutputs() {
            if (this.fOutputsItems.length > 0 && this.fOutputHandler && this.fOutputsTimer-- === 0) {
                this.fOutputsTimer = 5;
                this.fOutputsItems.forEach(item => { if (this.fOutputHandler)
                    this.fOutputHandler(item, this.getParamValue(item)); });
            }
        }
        metadata(handler) {
            if (this.fJSONDsp.meta) {
                this.fJSONDsp.meta.forEach(meta => handler(Object.keys(meta)[0], meta[Object.keys(meta)[0]]));
            }
        }
        compute(input, output) {
            return false;
        }
        setOutputParamHandler(handler) {
            this.fOutputHandler = handler;
        }
        getOutputParamHandler() {
            return this.fOutputHandler;
        }
        setComputeHandler(handler) {
            this.fComputeHandler = handler;
        }
        getComputeHandler() {
            return this.fComputeHandler;
        }
        setPlotHandler(handler) {
            this.fPlotHandler = handler;
        }
        getPlotHandler() {
            return this.fPlotHandler;
        }
        getNumInputs() {
            return -1;
        }
        getNumOutputs() {
            return -1;
        }
        midiMessage(data) {
            if (this.fPlotHandler)
                this.fCachedEvents.push({ data, type: "midi" });
            const cmd = data[0] >> 4;
            const channel = data[0] & 0xf;
            const data1 = data[1];
            const data2 = data[2];
            if (cmd === 11)
                return this.ctrlChange(channel, data1, data2);
            if (cmd === 14)
                return this.pitchWheel(channel, (data2 * 128.0 + data1));
        }
        ctrlChange(channel, ctrl, value) {
            if (this.fPlotHandler)
                this.fCachedEvents.push({ type: "ctrlChange", data: [channel, ctrl, value] });
            if (this.fCtrlLabel[ctrl].length) {
                this.fCtrlLabel[ctrl].forEach((ctrl) => {
                    const { path } = ctrl;
                    this.setParamValue(path, BaseDSPImp.remap(value, 0, 127, ctrl.min, ctrl.max));
                    if (this.fOutputHandler)
                        this.fOutputHandler(path, this.getParamValue(path));
                });
            }
        }
        pitchWheel(channel, wheel) {
            if (this.fPlotHandler)
                this.fCachedEvents.push({ type: "pitchWheel", data: [channel, wheel] });
            this.fPitchwheelLabel.forEach((pw) => {
                this.setParamValue(pw.path, BaseDSPImp.remap(wheel, 0, 16383, pw.min, pw.max));
                if (this.fOutputHandler)
                    this.fOutputHandler(pw.path, this.getParamValue(pw.path));
            });
        }
        setParamValue(path, value) { }
        getParamValue(path) { return 0; }
        getParams() { return this.fInputsItems; }
        getJSON() { return ""; }
        getUI() { return this.fJSONDsp.ui; }
        destroy() {
            this.fDestroyed = true;
            this.fOutputHandler = null;
            this.fComputeHandler = null;
            this.fPlotHandler = null;
        }
    }
    Faust.BaseDSPImp = BaseDSPImp;
    function createMonoDSP(instance, sample_rate, buffer_size) {
        return new MonoDSPImp(instance, sample_rate, buffer_size);
    }
    Faust.createMonoDSP = createMonoDSP;
    class MonoDSPImp extends BaseDSPImp {
        constructor(instance, sample_rate, buffer_size) {
            super(buffer_size);
            this.fInstance = instance;
            this.fJSONDsp = JSON.parse(this.fInstance.json);
            BaseDSPImp.parseUI(this.fJSONDsp.ui, this.fUICallback);
            this.initMemory();
            this.fInstance.api.init(this.fDSP, sample_rate);
        }
        initMemory() {
            this.fDSP = 0;
            let audio_ptr = this.fJSONDsp.size;
            this.fAudioInputs = audio_ptr;
            this.fAudioOutputs = this.fAudioInputs + this.getNumInputs() * this.gPtrSize;
            let audio_inputs_ptr = this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize;
            let audio_outputs_ptr = audio_inputs_ptr + this.getNumInputs() * this.fBufferSize * this.gSampleSize;
            const HEAP = this.fInstance.memory.buffer;
            const HEAP32 = new Int32Array(HEAP);
            const HEAPF32 = new Float32Array(HEAP);
            if (this.getNumInputs() > 0) {
                for (let chan = 0; chan < this.getNumInputs(); chan++) {
                    HEAP32[(this.fAudioInputs >> 2) + chan] = audio_inputs_ptr + this.fBufferSize * this.gSampleSize * chan;
                }
                const dspInChans = HEAP32.subarray(this.fAudioInputs >> 2, (this.fAudioInputs + this.getNumInputs() * this.gPtrSize) >> 2);
                for (let chan = 0; chan < this.getNumInputs(); chan++) {
                    this.fInChannels[chan] = HEAPF32.subarray(dspInChans[chan] >> 2, (dspInChans[chan] + this.fBufferSize * this.gSampleSize) >> 2);
                }
            }
            if (this.getNumOutputs() > 0) {
                for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                    HEAP32[(this.fAudioOutputs >> 2) + chan] = audio_outputs_ptr + this.fBufferSize * this.gSampleSize * chan;
                }
                const dspOutChans = HEAP32.subarray(this.fAudioOutputs >> 2, (this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize) >> 2);
                for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                    this.fOutChannels[chan] = HEAPF32.subarray(dspOutChans[chan] >> 2, (dspOutChans[chan] + this.fBufferSize * this.gSampleSize) >> 2);
                }
            }
            console.log("============== Mono Memory layout ==============");
            console.log("this.fBufferSize: " + this.fBufferSize);
            console.log("this.fJSONDsp.size: " + this.fJSONDsp.size);
            console.log("this.fAudioInputs: " + this.fAudioInputs);
            console.log("this.fAudioOutputs: " + this.fAudioOutputs);
            console.log("audio_inputs_ptrs: " + audio_inputs_ptr);
            console.log("audio_outputs_ptr: " + audio_outputs_ptr);
            console.log("this.fDSP: " + this.fDSP);
        }
        compute(input, output) {
            if (this.fDestroyed)
                return false;
            if (this.getNumInputs() > 0 && (!input || !input[0] || input[0].length === 0)) {
                return true;
            }
            if (this.getNumOutputs() > 0 && (!output || !output[0] || output[0].length === 0)) {
                return true;
            }
            if (input !== undefined) {
                for (let chan = 0; chan < Math.min(this.getNumInputs(), input.length); ++chan) {
                    const dspInput = this.fInChannels[chan];
                    dspInput.set(input[chan]);
                }
            }
            if (this.fComputeHandler)
                this.fComputeHandler(this.fBufferSize);
            this.fInstance.api.compute(this.fDSP, this.fBufferSize, this.fAudioInputs, this.fAudioOutputs);
            this.updateOutputs();
            if (output !== undefined) {
                for (let chan = 0; chan < Math.min(this.getNumOutputs(), output.length); chan++) {
                    const dspOutput = this.fOutChannels[chan];
                    output[chan].set(dspOutput);
                }
                if (this.fPlotHandler) {
                    this.fPlotHandler(output, this.fBufferNum++, (this.fCachedEvents.length ? this.fCachedEvents : undefined));
                    this.fCachedEvents = [];
                }
            }
            return true;
        }
        metadata(handler) { super.metadata(handler); }
        getNumInputs() {
            return this.fInstance.api.getNumInputs(this.fDSP);
        }
        getNumOutputs() {
            return this.fInstance.api.getNumOutputs(this.fDSP);
        }
        setParamValue(path, value) {
            if (this.fPlotHandler)
                this.fCachedEvents.push({ type: "param", data: { path, value } });
            this.fInstance.api.setParamValue(this.fDSP, this.fPathTable[path], value);
        }
        getParamValue(path) {
            return this.fInstance.api.getParamValue(this.fDSP, this.fPathTable[path]);
        }
        getJSON() { return this.fInstance.json; }
        getUI() { return this.fJSONDsp.ui; }
    }
    Faust.MonoDSPImp = MonoDSPImp;
    class DspVoice {
        constructor(dsp, api, input_items, path_table, sample_rate) {
            DspVoice.kActiveVoice = 0;
            DspVoice.kFreeVoice = -1;
            DspVoice.kReleaseVoice = -2;
            DspVoice.kNoVoice = -3;
            DspVoice.VOICE_STOP_LEVEL = 0.0005;
            this.fKeyFun = (pitch) => { return DspVoice.midiToFreq(pitch); };
            this.fVelFun = (velocity) => { return velocity / 127.0; };
            this.fLevel = 0;
            this.fRelease = 0;
            this.fMaxRelease = sample_rate / 2;
            this.fNote = DspVoice.kFreeVoice;
            this.fDate = 0;
            this.fDSP = dsp;
            this.fAPI = api;
            this.fGateLabel = [];
            this.fGainLabel = [];
            this.fFreqLabel = [];
            this.fAPI.init(this.fDSP, sample_rate);
            this.extractPaths(input_items, path_table);
        }
        static midiToFreq(note) { return 440.0 * Math.pow(2, ((note - 69) / 12)); }
        extractPaths(input_items, path_table) {
            input_items.forEach((item) => {
                if (item.endsWith("/gate")) {
                    this.fGateLabel.push(path_table[item]);
                }
                else if (item.endsWith("/freq")) {
                    this.fKeyFun = (pitch) => { return DspVoice.midiToFreq(pitch); };
                    this.fFreqLabel.push(path_table[item]);
                }
                else if (item.endsWith("/key")) {
                    this.fKeyFun = (pitch) => { return pitch; };
                    this.fFreqLabel.push(path_table[item]);
                }
                else if (item.endsWith("/gain")) {
                    this.fVelFun = (velocity) => { return velocity / 127.0; };
                    this.fGainLabel.push(path_table[item]);
                }
                else if (item.endsWith("/vel") && item.endsWith("/velocity")) {
                    this.fVelFun = (velocity) => { return velocity; };
                    this.fGainLabel.push(path_table[item]);
                }
            });
        }
        keyOn(pitch, velocity) {
            this.fAPI.instanceClear(this.fDSP);
            this.fFreqLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, this.fKeyFun(pitch)));
            this.fGateLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, 1));
            this.fGainLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, this.fVelFun(velocity)));
            this.fNote = pitch;
        }
        keyOff(hard = false) {
            this.fGateLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, 0));
            if (hard) {
                this.fNote = DspVoice.kFreeVoice;
            }
            else {
                this.fRelease = this.fMaxRelease;
                this.fNote = DspVoice.kReleaseVoice;
            }
        }
        compute(buffer_size, inputs, outputs) {
            this.fAPI.compute(this.fDSP, buffer_size, inputs, outputs);
        }
        setParamValue(index, value) {
            this.fAPI.setParamValue(this.fDSP, index, value);
        }
        getParamValue(index) {
            return this.fAPI.getParamValue(this.fDSP, index);
        }
    }
    Faust.DspVoice = DspVoice;
    function createPolyDSP(instance, sample_rate, buffer_size) {
        return new PolyDSPImp(instance, sample_rate, buffer_size);
    }
    Faust.createPolyDSP = createPolyDSP;
    class PolyDSPImp extends BaseDSPImp {
        constructor(instance, sample_rate, buffer_size) {
            super(buffer_size);
            this.fInstance = instance;
            this.fJSONDsp = JSON.parse(this.fInstance.voice_json);
            this.fJSONEffect = (this.fInstance.effect_api && this.fInstance.effect_json) ? JSON.parse(this.fInstance.effect_json) : null;
            BaseDSPImp.parseUI(this.fJSONDsp.ui, this.fUICallback);
            if (this.fJSONEffect)
                BaseDSPImp.parseUI(this.fJSONEffect.ui, this.fUICallback);
            this.initMemory();
            this.fVoiceTable = [];
            for (let voice = 0; voice < this.fInstance.voices; voice++) {
                this.fVoiceTable.push(new DspVoice(this.fJSONDsp.size * voice, this.fInstance.voice_api, this.fInputsItems, this.fPathTable, sample_rate));
            }
            if (this.fInstance.effect_api)
                this.fInstance.effect_api.init(this.fEffect, sample_rate);
        }
        initMemory() {
            this.fEffect = this.fJSONDsp.size * this.fInstance.voices;
            let audio_ptr = this.fEffect + ((this.fJSONEffect) ? this.fJSONEffect.size : 0);
            this.fAudioInputs = audio_ptr;
            this.fAudioOutputs = this.fAudioInputs + this.getNumInputs() * this.gPtrSize;
            this.fAudioMixing = this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize;
            let audio_inputs_ptr = this.fAudioMixing + this.getNumOutputs() * this.gPtrSize;
            let audio_outputs_ptr = audio_inputs_ptr + this.getNumInputs() * this.fBufferSize * this.gSampleSize;
            let audio_mixing_ptr = audio_outputs_ptr + this.getNumOutputs() * this.fBufferSize * this.gSampleSize;
            const HEAP = this.fInstance.memory.buffer;
            const HEAP32 = new Int32Array(HEAP);
            const HEAPF32 = new Float32Array(HEAP);
            if (this.getNumInputs() > 0) {
                for (let chan = 0; chan < this.getNumInputs(); chan++) {
                    HEAP32[(this.fAudioInputs >> 2) + chan] = audio_inputs_ptr + this.fBufferSize * this.gSampleSize * chan;
                }
                const dspInChans = HEAP32.subarray(this.fAudioInputs >> 2, (this.fAudioInputs + this.getNumInputs() * this.gPtrSize) >> 2);
                for (let chan = 0; chan < this.getNumInputs(); chan++) {
                    this.fInChannels[chan] = HEAPF32.subarray(dspInChans[chan] >> 2, (dspInChans[chan] + this.fBufferSize * this.gSampleSize) >> 2);
                }
            }
            if (this.getNumOutputs() > 0) {
                for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                    HEAP32[(this.fAudioOutputs >> 2) + chan] = audio_outputs_ptr + this.fBufferSize * this.gSampleSize * chan;
                    HEAP32[(this.fAudioMixing >> 2) + chan] = audio_mixing_ptr + this.fBufferSize * this.gSampleSize * chan;
                }
                const dspOutChans = HEAP32.subarray(this.fAudioOutputs >> 2, (this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize) >> 2);
                for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                    this.fOutChannels[chan] = HEAPF32.subarray(dspOutChans[chan] >> 2, (dspOutChans[chan] + this.fBufferSize * this.gSampleSize) >> 2);
                }
            }
            console.log("============== Poly Memory layout ==============");
            console.log("this.fBufferSize: " + this.fBufferSize);
            console.log("this.fJSONDsp.size: " + this.fJSONDsp.size);
            console.log("this.fAudioInputs: " + this.fAudioInputs);
            console.log("this.fAudioOutputs: " + this.fAudioOutputs);
            console.log("this.fAudioMixing: " + this.fAudioMixing);
            console.log("audio_inputs_ptrs: " + audio_inputs_ptr);
            console.log("audio_outputs_ptr: " + audio_outputs_ptr);
            console.log("audio_mixing_ptr: " + audio_mixing_ptr);
        }
        allocVoice(voice) {
            this.fVoiceTable[voice].fDate++;
            this.fVoiceTable[voice].fNote = DspVoice.kActiveVoice;
            return voice;
        }
        getPlayingVoice(pitch) {
            let playing_voice = DspVoice.kNoVoice;
            let oldest_date_playing = Number.MAX_VALUE;
            for (let voice = 0; voice < this.fInstance.voices; voice++) {
                if (this.fVoiceTable[voice].fNote === pitch) {
                    if (this.fVoiceTable[voice].fDate < oldest_date_playing) {
                        oldest_date_playing = this.fVoiceTable[voice].fDate;
                        playing_voice = voice;
                    }
                }
            }
            return playing_voice;
        }
        getFreeVoice() {
            for (let voice = 0; voice < this.fInstance.voices; voice++) {
                if (this.fVoiceTable[voice].fNote === DspVoice.kFreeVoice)
                    return this.allocVoice(voice);
            }
            let voice_release = DspVoice.kNoVoice;
            let voice_playing = DspVoice.kNoVoice;
            let oldest_date_release = Number.MAX_VALUE;
            let oldest_date_playing = Number.MAX_VALUE;
            for (let voice = 0; voice < this.fInstance.voices; voice++) {
                if (this.fVoiceTable[voice].fNote === DspVoice.kReleaseVoice) {
                    if (this.fVoiceTable[voice].fDate < oldest_date_release) {
                        oldest_date_release = this.fVoiceTable[voice].fDate;
                        voice_release = voice;
                    }
                }
                else if (this.fVoiceTable[voice].fDate < oldest_date_playing) {
                    oldest_date_playing = this.fVoiceTable[voice].fDate;
                    voice_playing = voice;
                }
            }
            if (oldest_date_release !== Number.MAX_VALUE) {
                console.log(`Steal release voice : voice_date = ${this.fVoiceTable[voice_release].fDate} voice = ${voice_release}`);
                return this.allocVoice(voice_release);
            }
            if (oldest_date_playing !== Number.MAX_VALUE) {
                console.log(`Steal playing voice : voice_date = ${this.fVoiceTable[voice_playing].fDate} voice = ${voice_playing}`);
                return this.allocVoice(voice_playing);
            }
            return DspVoice.kNoVoice;
        }
        compute(input, output) {
            if (this.fDestroyed)
                return false;
            if (this.getNumInputs() > 0 && (!input || !input[0] || input[0].length === 0)) {
                return true;
            }
            if (this.getNumOutputs() > 0 && (!output || !output[0] || output[0].length === 0)) {
                return true;
            }
            if (input !== undefined) {
                for (let chan = 0; chan < Math.min(this.getNumInputs(), input.length); ++chan) {
                    const dspInput = this.fInChannels[chan];
                    dspInput.set(input[chan]);
                }
            }
            if (this.fComputeHandler)
                this.fComputeHandler(this.fBufferSize);
            this.fInstance.mixer_api.clearOutput(this.fBufferSize, this.getNumOutputs(), this.fAudioOutputs);
            this.fVoiceTable.forEach(voice => {
                if (voice.fNote !== DspVoice.kFreeVoice) {
                    voice.compute(this.fBufferSize, this.fAudioInputs, this.fAudioMixing);
                    voice.fLevel = this.fInstance.mixer_api.mixVoice(this.fBufferSize, this.getNumOutputs(), this.fAudioMixing, this.fAudioOutputs);
                    voice.fRelease -= this.fBufferSize;
                    if ((voice.fNote == DspVoice.kReleaseVoice) && ((voice.fLevel < DspVoice.VOICE_STOP_LEVEL) || (voice.fRelease < 0))) {
                        voice.fNote = DspVoice.kFreeVoice;
                    }
                }
            });
            if (this.fInstance.effect_api)
                this.fInstance.effect_api.compute(this.fEffect, this.fBufferSize, this.fAudioOutputs, this.fAudioOutputs);
            this.updateOutputs();
            if (output !== undefined) {
                for (let chan = 0; chan < Math.min(this.getNumOutputs(), output.length); chan++) {
                    const dspOutput = this.fOutChannels[chan];
                    output[chan].set(dspOutput);
                }
                if (this.fPlotHandler) {
                    this.fPlotHandler(output, this.fBufferNum++, (this.fCachedEvents.length ? this.fCachedEvents : undefined));
                    this.fCachedEvents = [];
                }
            }
            return true;
        }
        getNumInputs() {
            return this.fInstance.voice_api.getNumInputs(0);
        }
        getNumOutputs() {
            return this.fInstance.voice_api.getNumOutputs(0);
        }
        static findPath(o, p) {
            if (typeof o !== "object") {
                return false;
            }
            else if (o.address) {
                return (o.address === p);
            }
            else {
                for (const k in o) {
                    if (PolyDSPImp.findPath(o[k], p))
                        return true;
                }
                return false;
            }
        }
        setParamValue(path, value) {
            if (this.fPlotHandler)
                this.fCachedEvents.push({ type: "param", data: { path, value } });
            if (this.fJSONEffect && PolyDSPImp.findPath(this.fJSONEffect.ui, path) && this.fInstance.effect_api) {
                this.fInstance.effect_api.setParamValue(this.fEffect, this.fPathTable[path], value);
            }
            else {
                this.fVoiceTable.forEach(voice => { voice.setParamValue(this.fPathTable[path], value); });
            }
        }
        getParamValue(path) {
            if (this.fJSONEffect && PolyDSPImp.findPath(this.fJSONEffect.ui, path) && this.fInstance.effect_api) {
                return this.fInstance.effect_api.getParamValue(this.fEffect, this.fPathTable[path]);
            }
            else {
                return this.fVoiceTable[0].getParamValue(this.fPathTable[path]);
            }
        }
        getJSON() {
            const o = this.fJSONDsp;
            const e = this.fJSONEffect;
            const r = Object.assign({}, o);
            if (e) {
                r.ui = [{
                        type: "tgroup", label: "Sequencer", items: [
                            { type: "vgroup", label: "Instrument", items: o.ui },
                            { type: "vgroup", label: "Effect", items: e.ui }
                        ]
                    }];
            }
            else {
                r.ui = [{
                        type: "tgroup", label: "Polyphonic", items: [
                            { type: "vgroup", label: "Voices", items: o.ui }
                        ]
                    }];
            }
            return JSON.stringify(r);
        }
        getUI() {
            const o = this.fJSONDsp;
            const e = this.fJSONEffect;
            const r = Object.assign({}, o);
            if (e) {
                return [{
                        type: "tgroup", label: "Sequencer", items: [
                            { type: "vgroup", label: "Instrument", items: o.ui },
                            { type: "vgroup", label: "Effect", items: e.ui }
                        ]
                    }];
            }
            else {
                return [{
                        type: "tgroup", label: "Polyphonic", items: [
                            { type: "vgroup", label: "Voices", items: o.ui }
                        ]
                    }];
            }
        }
        midiMessage(data) {
            const cmd = data[0] >> 4;
            const channel = data[0] & 0xf;
            const data1 = data[1];
            const data2 = data[2];
            if (cmd === 8 || (cmd === 9 && data2 === 0))
                return this.keyOff(channel, data1, data2);
            else if (cmd === 9)
                return this.keyOn(channel, data1, data2);
            else
                super.midiMessage(data);
        }
        ;
        ctrlChange(channel, ctrl, value) {
            if (ctrl === 123 || ctrl === 120) {
                this.allNotesOff(true);
            }
            else {
                super.ctrlChange(channel, ctrl, value);
            }
        }
        keyOn(channel, pitch, velocity) {
            let voice = this.getFreeVoice();
            this.fVoiceTable[voice].keyOn(pitch, velocity);
        }
        keyOff(channel, pitch, velocity) {
            let voice = this.getPlayingVoice(pitch);
            if (voice !== DspVoice.kNoVoice) {
                this.fVoiceTable[voice].keyOff();
            }
            else {
                console.log("Playing pitch = %d not found\n", pitch);
            }
        }
        allNotesOff(hard = true) {
            this.fCachedEvents.push({ type: "ctrlChange", data: [0, 123, 0] });
            this.fVoiceTable.forEach(voice => voice.keyOff(hard));
        }
    }
    Faust.PolyDSPImp = PolyDSPImp;
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    class FaustAudioWorkletNodeImp extends AudioWorkletNode {
        constructor(context, name, factory, options) {
            const JSONObj = JSON.parse(factory.json);
            super(context, name, {
                numberOfInputs: JSONObj.inputs > 0 ? 1 : 0,
                numberOfOutputs: JSONObj.outputs > 0 ? 1 : 0,
                channelCount: Math.max(1, JSONObj.inputs),
                outputChannelCount: [JSONObj.outputs],
                channelCountMode: "explicit",
                channelInterpretation: "speakers",
                processorOptions: options
            });
            this.fJSONDsp = JSONObj;
            this.fJSON = factory.json;
            this.fOutputHandler = null;
            this.fComputeHandler = null;
            this.fPlotHandler = null;
            this.fInputsItems = [];
            this.fUICallback = (item) => {
                if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
                    this.fInputsItems.push(item.address);
                }
            };
            Faust.BaseDSPImp.parseUI(this.fJSONDsp.ui, this.fUICallback);
            this.port.onmessage = (e) => {
                if (e.data.type === "param" && this.fOutputHandler) {
                    this.fOutputHandler(e.data.path, e.data.value);
                }
                else if (e.data.type === "plot") {
                    if (this.fPlotHandler)
                        this.fPlotHandler(e.data.value, e.data.index, e.data.events);
                }
            };
        }
        setOutputParamHandler(handler) {
            this.fOutputHandler = handler;
        }
        getOutputParamHandler() {
            return this.fOutputHandler;
        }
        setComputeHandler(handler) {
            this.fComputeHandler = handler;
        }
        getComputeHandler() {
            return this.fComputeHandler;
        }
        setPlotHandler(handler) {
            this.fPlotHandler = handler;
            if (this.fPlotHandler) {
                this.port.postMessage({ type: "setPlotHandler", data: true });
            }
            else {
                this.port.postMessage({ type: "setPlotHandler", data: false });
            }
        }
        getPlotHandler() {
            return this.fPlotHandler;
        }
        getNumInputs() {
            return this.fJSONDsp.inputs;
        }
        getNumOutputs() {
            return this.fJSONDsp.outputs;
        }
        compute(inputs, outputs) {
            return false;
        }
        metadata(handler) {
            if (this.fJSONDsp.meta) {
                this.fJSONDsp.meta.forEach(meta => handler(Object.keys(meta)[0], meta[Object.keys(meta)[0]]));
            }
        }
        midiMessage(data) {
            const cmd = data[0] >> 4;
            const channel = data[0] & 0xf;
            const data1 = data[1];
            const data2 = data[2];
            if (cmd === 11)
                this.ctrlChange(channel, data1, data2);
            else if (cmd === 14)
                this.pitchWheel(channel, data2 * 128.0 + data1);
            else
                this.port.postMessage({ type: "midi", data: data });
        }
        ctrlChange(channel, ctrl, value) {
            const e = { type: "ctrlChange", data: [channel, ctrl, value] };
            this.port.postMessage(e);
        }
        pitchWheel(channel, wheel) {
            const e = { type: "pitchWheel", data: [channel, wheel] };
            this.port.postMessage(e);
        }
        setParamValue(path, value) {
            const e = { type: "param", data: { path, value } };
            this.port.postMessage(e);
            const param = this.parameters.get(path);
            if (param)
                param.setValueAtTime(value, this.context.currentTime);
        }
        getParamValue(path) {
            const param = this.parameters.get(path);
            return (param) ? param.value : 0;
        }
        getParams() { return this.fInputsItems; }
        getJSON() { return this.fJSON; }
        getUI() { return this.fJSONDsp.ui; }
        destroy() {
            this.port.postMessage({ type: "destroy" });
            this.port.close();
        }
    }
    class FaustMonoAudioWorkletNodeImp extends FaustAudioWorkletNodeImp {
        constructor(context, name, factory) {
            super(context, name, factory, { name: name, factory: factory });
            this.onprocessorerror = (e) => {
                console.error("Error from " + this.fJSONDsp.name + " FaustMonoAudioWorkletNode");
                throw e;
            };
        }
    }
    Faust.FaustMonoAudioWorkletNodeImp = FaustMonoAudioWorkletNodeImp;
    class FaustPolyAudioWorkletNodeImp extends FaustAudioWorkletNodeImp {
        constructor(context, name, voice_factory, mixer_module, voices, effect_factory) {
            super(context, name, voice_factory, {
                name: name,
                voice_factory: voice_factory,
                mixer_module: mixer_module,
                voices: voices,
                effect_factory: effect_factory
            });
            this.onprocessorerror = (e) => {
                console.error("Error from " + this.fJSONDsp.name + " FaustPolyAudioWorkletNode");
                throw e;
            };
            this.fJSONEffect = (effect_factory) ? JSON.parse(effect_factory.json) : null;
            if (effect_factory) {
                Faust.BaseDSPImp.parseUI(this.fJSONEffect.ui, this.fUICallback);
            }
        }
        keyOn(channel, pitch, velocity) {
            const e = { type: "keyOn", data: [channel, pitch, velocity] };
            this.port.postMessage(e);
        }
        keyOff(channel, pitch, velocity) {
            const e = { type: "keyOff", data: [channel, pitch, velocity] };
            this.port.postMessage(e);
        }
        allNotesOff(hard) {
            const e = { type: "ctrlChange", data: [0, 123, 0] };
            this.port.postMessage(e);
        }
        getJSON() {
            const o = this.fJSONDsp;
            const e = this.fJSONEffect;
            const r = Object.assign({}, o);
            if (e) {
                r.ui = [{
                        type: "tgroup", label: "Sequencer", items: [
                            { type: "vgroup", label: "Instrument", items: o.ui },
                            { type: "vgroup", label: "Effect", items: e.ui }
                        ]
                    }];
            }
            else {
                r.ui = [{
                        type: "tgroup", label: "Polyphonic", items: [
                            { type: "vgroup", label: "Voices", items: o.ui }
                        ]
                    }];
            }
            return JSON.stringify(r);
        }
        getUI() {
            const o = this.fJSONDsp;
            const e = this.fJSONEffect;
            const r = Object.assign({}, o);
            if (e) {
                return [{
                        type: "tgroup", label: "Sequencer", items: [
                            { type: "vgroup", label: "Instrument", items: o.ui },
                            { type: "vgroup", label: "Effect", items: e.ui }
                        ]
                    }];
            }
            else {
                return [{
                        type: "tgroup", label: "Polyphonic", items: [
                            { type: "vgroup", label: "Voices", items: o.ui }
                        ]
                    }];
            }
        }
    }
    Faust.FaustPolyAudioWorkletNodeImp = FaustPolyAudioWorkletNodeImp;
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    Faust.FaustAudioWorkletProcessorGenerator = () => {
        class FaustConst {
        }
        FaustConst.dsp_name = faustData.dsp_name;
        FaustConst.dsp_JSON = faustData.dsp_JSON;
        FaustConst.effect_JSON = faustData.effect_JSON;
        class FaustAudioWorkletProcessorImp extends AudioWorkletProcessor {
            constructor(options) {
                super(options);
                this.port.onmessage = (e) => { this.handleMessageAux(e); };
            }
            static get parameterDescriptors() {
                const params = [];
                let callback = (item) => {
                    if (item.type === "vslider" || item.type === "hslider" || item.type === "nentry") {
                        params.push({ name: item.address, defaultValue: item.init || 0, minValue: item.min || 0, maxValue: item.max || 0 });
                    }
                    else if (item.type === "button" || item.type === "checkbox") {
                        params.push({ name: item.address, defaultValue: item.init || 0, minValue: 0, maxValue: 1 });
                    }
                };
                Faust.BaseDSPImp.parseUI(JSON.parse(FaustConst.dsp_JSON).ui, callback);
                if (FaustConst.effect_JSON)
                    Faust.BaseDSPImp.parseUI(JSON.parse(FaustConst.effect_JSON).ui, callback);
                console.log(params);
                return params;
            }
            process(inputs, outputs, parameters) {
                return this.fDSPCode.compute(inputs[0], outputs[0]);
            }
            handleMessageAux(e) {
                const msg = e.data;
                switch (msg.type) {
                    case "midi":
                        this.midiMessage(msg.data);
                        break;
                    case "ctrlChange":
                        this.ctrlChange(msg.data[0], msg.data[1], msg.data[2]);
                        break;
                    case "pitchWheel":
                        this.pitchWheel(msg.data[0], msg.data[1]);
                        break;
                    case "param":
                        this.setParamValue(msg.data.path, msg.data.value);
                        break;
                    case "setPlotHandler": {
                        if (msg.data) {
                            this.fDSPCode.setPlotHandler((output, index, events) => this.port.postMessage({ type: "plot", value: output, index: index, events: events }));
                        }
                        else {
                            this.fDSPCode.setPlotHandler(null);
                        }
                        break;
                    }
                    case "destroy": {
                        this.port.close();
                        this.fDSPCode.destroy();
                        break;
                    }
                    default:
                        break;
                }
            }
            setParamValue(path, value) {
                this.fDSPCode.setParamValue(path, value);
            }
            midiMessage(data) {
                this.fDSPCode.midiMessage(data);
            }
            ctrlChange(channel, ctrl, value) {
                this.fDSPCode.ctrlChange(channel, ctrl, value);
            }
            pitchWheel(channel, wheel) {
                this.fDSPCode.pitchWheel(channel, wheel);
            }
        }
        class FaustMonoAudioWorkletProcessorImp extends FaustAudioWorkletProcessorImp {
            constructor(options) {
                super(options);
                this.fDSPCode = Faust.createMonoDSP(new Faust.GeneratorImp().createSyncMonoDSPInstance(options.processorOptions.factory), sampleRate, 128);
                this.fDSPCode.setOutputParamHandler((path, value) => this.port.postMessage({ path, value, type: "param" }));
            }
        }
        class FaustPolyAudioWorkletProcessorImp extends FaustAudioWorkletProcessorImp {
            constructor(options) {
                super(options);
                this.handleMessageAux = (e) => {
                    const msg = e.data;
                    switch (msg.type) {
                        case "keyOn":
                            this.keyOn(msg.data[0], msg.data[1], msg.data[2]);
                            break;
                        case "keyOff":
                            this.keyOff(msg.data[0], msg.data[1], msg.data[2]);
                            break;
                        default:
                            super.handleMessageAux(e);
                            break;
                    }
                };
                this.fDSPCode = Faust.createPolyDSP(new Faust.GeneratorImp().createSyncPolyDSPInstance(options.processorOptions.voice_factory, options.processorOptions.mixer_module, options.processorOptions.voices, options.processorOptions.effect_factory), sampleRate, 128);
                this.port.onmessage = (e) => { this.handleMessageAux(e); };
                this.fDSPCode.setOutputParamHandler((path, value) => this.port.postMessage({ path, value, type: "param" }));
            }
            midiMessage(data) {
                const cmd = data[0] >> 4;
                const channel = data[0] & 0xf;
                const data1 = data[1];
                const data2 = data[2];
                if (cmd === 8 || (cmd === 9 && data2 === 0))
                    this.keyOff(channel, data1, data2);
                else if (cmd === 9)
                    this.keyOn(channel, data1, data2);
                else
                    super.midiMessage(data);
            }
            keyOn(channel, pitch, velocity) {
                this.fDSPCode.keyOn(channel, pitch, velocity);
            }
            keyOff(channel, pitch, velocity) {
                this.fDSPCode.keyOff(channel, pitch, velocity);
            }
            allNotesOff(hard) {
                this.fDSPCode.allNotesOff(hard);
            }
        }
        if (FaustConst.dsp_name.endsWith("_poly")) {
            registerProcessor(FaustConst.dsp_name || "mydsp_poly", FaustPolyAudioWorkletProcessorImp);
        }
        else {
            registerProcessor(FaustConst.dsp_name || "mydsp", FaustMonoAudioWorkletProcessorImp);
        }
    };
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    function createCompiler(engine) { return new CompilerImp(engine); }
    Faust.createCompiler = createCompiler;
    class CompilerImp {
        constructor(engine) {
            this.fFaustEngine = engine;
            this.fErrorMessage = "";
        }
        intVec2intArray(vec) {
            const size = vec.size();
            const ui8Code = new Uint8Array(size);
            for (let i = 0; i < size; i++) {
                ui8Code[i] = vec.get(i);
            }
            return ui8Code;
        }
        createDSPFactoryImp(name, dsp_code, args, poly) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const faust_wasm = this.fFaustEngine.createDSPFactory(name, dsp_code, args, !poly);
                    try {
                        const module = yield WebAssembly.compile(this.intVec2intArray(faust_wasm.data));
                        return { cfactory: faust_wasm.cfactory, module: module, json: faust_wasm.json, poly: poly };
                    }
                    catch (e) {
                        console.error(e);
                        return null;
                    }
                }
                catch (_a) {
                    this.fErrorMessage = this.fFaustEngine.getErrorAfterException();
                    console.error("=> exception raised while running createDSPFactory: " + this.fErrorMessage);
                    this.fFaustEngine.cleanupAfterException();
                    return null;
                }
            });
        }
        version() { return this.fFaustEngine.version(); }
        getErrorMessage() { return this.fErrorMessage; }
        createMonoDSPFactory(name, dsp_code, args) {
            return __awaiter(this, void 0, void 0, function* () {
                return this.createDSPFactoryImp(name, dsp_code, args, false);
            });
        }
        createPolyDSPFactory(name, dsp_code, args) {
            return __awaiter(this, void 0, void 0, function* () {
                return this.createDSPFactoryImp(name, dsp_code, args, true);
            });
        }
        deleteDSPFactory(factory) {
            this.fFaustEngine.deleteDSPFactory(factory.cfactory);
        }
        expandDSP(dsp_code, args) {
            try {
                return this.fFaustEngine.expandDSP("FaustDSP", dsp_code, args);
            }
            catch (_a) {
                this.fErrorMessage = this.fFaustEngine.getErrorAfterException();
                console.error("=> exception raised while running expandDSP: " + this.fErrorMessage);
                this.fFaustEngine.cleanupAfterException();
                return null;
            }
        }
        generateAuxFiles(name, dsp_code, args) {
            try {
                return this.fFaustEngine.generateAuxFiles(name, dsp_code, args);
            }
            catch (_a) {
                this.fErrorMessage = this.fFaustEngine.getErrorAfterException();
                console.error("=> exception raised while running generateAuxFiles: " + this.fErrorMessage);
                this.fFaustEngine.cleanupAfterException();
                return false;
            }
        }
        deleteAllDSPFactories() {
            this.fFaustEngine.deleteAllDSPFactories();
        }
    }
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    class InstanceAPIImpl {
        constructor(exports) { this.fExports = exports; }
        compute(dsp, count, input, output) { this.fExports.compute(dsp, count, input, output); }
        getNumInputs(dsp) { return this.fExports.getNumInputs(dsp); }
        getNumOutputs(dsp) { return this.fExports.getNumOutputs(dsp); }
        getParamValue(dsp, index) { return this.fExports.getParamValue(dsp, index); }
        getSampleRate(dsp) { return this.fExports.getSampleRate(dsp); }
        init(dsp, sampleRate) { this.fExports.init(dsp, sampleRate); }
        instanceClear(dsp) { this.fExports.instanceClear(dsp); }
        instanceConstants(dsp, sampleRate) { this.fExports.instanceConstants(dsp, sampleRate); }
        instanceInit(dsp, sampleRate) { this.fExports.instanceInit(dsp, sampleRate); }
        instanceResetUserInterface(dsp) { this.fExports.instanceResetUserInterface(dsp); }
        setParamValue(dsp, index, value) { this.fExports.setParamValue(dsp, index, value); }
    }
    Faust.InstanceAPIImpl = InstanceAPIImpl;
    function createGenerator() { return new GeneratorImp(); }
    Faust.createGenerator = createGenerator;
    class GeneratorImp {
        createWasmImport(memory) {
            return {
                env: {
                    memory: ((memory) ? memory : new WebAssembly.Memory({ initial: 100 })),
                    memoryBase: 0,
                    tableBase: 0,
                    _abs: Math.abs,
                    _acosf: Math.acos, _asinf: Math.asin, _atanf: Math.atan, _atan2f: Math.atan2,
                    _ceilf: Math.ceil, _cosf: Math.cos, _expf: Math.exp, _floorf: Math.floor,
                    _fmodf: (x, y) => x % y,
                    _logf: Math.log, _log10f: Math.log10, _max_f: Math.max, _min_f: Math.min,
                    _remainderf: (x, y) => x - Math.round(x / y) * y,
                    _powf: Math.pow, _roundf: Math.fround, _sinf: Math.sin, _sqrtf: Math.sqrt, _tanf: Math.tan,
                    _acoshf: Math.acosh, _asinhf: Math.asinh, _atanhf: Math.atanh,
                    _coshf: Math.cosh, _sinhf: Math.sinh, _tanhf: Math.tanh,
                    _acos: Math.acos, _asin: Math.asin, _atan: Math.atan, _atan2: Math.atan2,
                    _ceil: Math.ceil, _cos: Math.cos, _exp: Math.exp, _floor: Math.floor,
                    _fmod: (x, y) => x % y,
                    _log: Math.log, _log10: Math.log10, _max_: Math.max, _min_: Math.min,
                    _remainder: (x, y) => x - Math.round(x / y) * y,
                    _pow: Math.pow, _round: Math.fround, _sin: Math.sin, _sqrt: Math.sqrt, _tan: Math.tan,
                    _acosh: Math.acosh, _asinh: Math.asinh, _atanh: Math.atanh,
                    _cosh: Math.cosh, _sinh: Math.sinh, _tanh: Math.tanh,
                    table: new WebAssembly.Table({ initial: 0, element: "anyfunc" })
                }
            };
        }
        createWasmMemory(voicesIn, dsp_JSON, effect_JSON, buffer_size) {
            const voices = Math.max(4, voicesIn);
            const ptr_size = 4;
            const sample_size = 4;
            const pow2limit = (x) => {
                let n = 65536;
                while (n < x) {
                    n *= 2;
                }
                return n;
            };
            const effect_size = (effect_JSON ? effect_JSON.size : 0);
            let memory_size = pow2limit(effect_size
                + dsp_JSON.size * voices
                + (dsp_JSON.inputs + dsp_JSON.outputs * 2)
                    * (ptr_size + buffer_size * sample_size)) / 65536;
            memory_size = Math.max(2, memory_size);
            console.log("memory_size", memory_size);
            return new WebAssembly.Memory({ initial: memory_size, maximum: memory_size });
        }
        createMonoDSPInstanceAux(instance, factory) {
            const functions = instance.exports;
            const api = new InstanceAPIImpl(functions);
            const memory = instance.exports.memory;
            return { memory: memory, api: api, json: factory.json };
        }
        createMemoryAux(voices, voice_factory, effect_factory) {
            const voice_JSON = JSON.parse(voice_factory.json);
            const effect_JSON = (effect_factory && effect_factory.json) ? JSON.parse(effect_factory.json) : null;
            return this.createWasmMemory(voices, voice_JSON, effect_JSON, 8192);
        }
        createMixerAux(mixer_module, memory) {
            const mix_import = {
                imports: { print: console.log },
                memory: { memory }
            };
            const mixer_instance = new WebAssembly.Instance(mixer_module, mix_import);
            const mixer_functions = mixer_instance.exports;
            return mixer_functions;
        }
        loadDSPFactory(wasm_path, json_path) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const wasm_file = yield fetch(wasm_path);
                    const wasm_buffer = yield wasm_file.arrayBuffer();
                    const module = yield WebAssembly.compile(wasm_buffer);
                    const json_file = yield fetch(json_path);
                    const json = yield json_file.text();
                    const JSONDsp = JSON.parse(json);
                    const c_options = JSONDsp.compile_options;
                    const poly = c_options.indexOf('wasm-e') !== -1;
                    return { cfactory: 0, module: module, json: json, poly: poly };
                }
                catch (e) {
                    console.error("=> exception raised while running loadDSPFactory: " + e);
                    return null;
                }
            });
        }
        loadDSPMixer(mixer_path) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const mixer_file = yield fetch(mixer_path);
                    const mixer_buffer = yield mixer_file.arrayBuffer();
                    return WebAssembly.compile(mixer_buffer);
                }
                catch (e) {
                    console.error("=> exception raised while running loadMixer: " + e);
                    return null;
                }
            });
        }
        createAsyncMonoDSPInstance(factory) {
            return __awaiter(this, void 0, void 0, function* () {
                const instance = yield WebAssembly.instantiate(factory.module, this.createWasmImport());
                return this.createMonoDSPInstanceAux(instance, factory);
            });
        }
        createSyncMonoDSPInstance(factory) {
            const instance = new WebAssembly.Instance(factory.module, this.createWasmImport());
            return this.createMonoDSPInstanceAux(instance, factory);
        }
        createAsyncPolyDSPInstance(voice_factory, mixer_module, voices, effect_factory) {
            return __awaiter(this, void 0, void 0, function* () {
                const memory = this.createMemoryAux(voices, voice_factory, effect_factory);
                const voice_instance = yield WebAssembly.instantiate(voice_factory.module, this.createWasmImport(memory));
                const voice_functions = voice_instance.exports;
                const voice_api = new InstanceAPIImpl(voice_functions);
                const mixer_api = this.createMixerAux(mixer_module, memory);
                if (effect_factory) {
                    const effect_instance = yield WebAssembly.instantiate(effect_factory.module, this.createWasmImport(memory));
                    const effect_functions = effect_instance.exports;
                    let effect_api = new InstanceAPIImpl(effect_functions);
                    return {
                        memory: memory,
                        voices: voices,
                        voice_api: voice_api,
                        effect_api: effect_api,
                        mixer_api: mixer_api,
                        voice_json: voice_factory.json,
                        effect_json: effect_factory.json
                    };
                }
                else {
                    return {
                        memory: memory,
                        voices: voices,
                        voice_api: voice_api,
                        effect_api: undefined,
                        mixer_api: mixer_api,
                        voice_json: voice_factory.json,
                        effect_json: undefined
                    };
                }
            });
        }
        createSyncPolyDSPInstance(voice_factory, mixer_module, voices, effect_factory) {
            const memory = this.createMemoryAux(voices, voice_factory, effect_factory);
            const voice_instance = new WebAssembly.Instance(voice_factory.module, this.createWasmImport(memory));
            const voice_functions = voice_instance.exports;
            const voice_api = new InstanceAPIImpl(voice_functions);
            const mixer_api = this.createMixerAux(mixer_module, memory);
            if (effect_factory) {
                const effect_instance = new WebAssembly.Instance(effect_factory.module, this.createWasmImport(memory));
                const effect_functions = effect_instance.exports;
                let effect_api = new InstanceAPIImpl(effect_functions);
                return {
                    memory: memory,
                    voices: voices,
                    voice_api: voice_api,
                    effect_api: effect_api,
                    mixer_api: mixer_api,
                    voice_json: voice_factory.json,
                    effect_json: effect_factory.json
                };
            }
            else {
                return {
                    memory: memory,
                    voices: voices,
                    voice_api: voice_api,
                    effect_api: undefined,
                    mixer_api: mixer_api,
                    voice_json: voice_factory.json,
                    effect_json: undefined
                };
            }
        }
    }
    Faust.GeneratorImp = GeneratorImp;
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    class FaustOfflineProcessorImp {
        constructor(instance, buffer_size) {
            this.fDSPCode = instance;
            this.fBufferSize = buffer_size;
            this.fInputs = new Array(this.fDSPCode.getNumInputs()).fill(null).map(() => new Float32Array(buffer_size));
            this.fOutputs = new Array(this.fDSPCode.getNumOutputs()).fill(null).map(() => new Float32Array(buffer_size));
        }
        plot(size) {
            let plotted = new Array(this.fDSPCode.getNumOutputs()).fill(null).map(() => new Float32Array(size));
            for (let frame = 0; frame < size; frame += this.fBufferSize) {
                this.fDSPCode.compute(this.fInputs, this.fOutputs);
                for (let chan = 0; chan < plotted.length; chan++) {
                    plotted[chan].set(size - frame > this.fBufferSize ? this.fOutputs[chan] : this.fOutputs[chan].subarray(0, size - frame), frame);
                }
            }
            return plotted;
        }
    }
    Faust.FaustOfflineProcessorImp = FaustOfflineProcessorImp;
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    class FaustScriptProcessorNodeImp {
        setupNode(node) {
            this.fInputs = new Array(this.fDSPCode.getNumInputs());
            this.fOutputs = new Array(this.fDSPCode.getNumOutputs());
            node.onaudioprocess = (e) => {
                for (let chan = 0; chan < this.fDSPCode.getNumInputs(); chan++) {
                    this.fInputs[chan] = e.inputBuffer.getChannelData(chan);
                }
                for (let chan = 0; chan < this.fDSPCode.getNumOutputs(); chan++) {
                    this.fOutputs[chan] = e.outputBuffer.getChannelData(chan);
                }
                return this.fDSPCode.compute(this.fInputs, this.fOutputs);
            };
            node.setOutputParamHandler = (handler) => {
                this.fDSPCode.setOutputParamHandler(handler);
            };
            node.getOutputParamHandler = () => { return this.fDSPCode.getOutputParamHandler(); };
            node.setComputeHandler = (handler) => {
                this.fDSPCode.setComputeHandler(handler);
            };
            node.getComputeHandler = () => { return this.fDSPCode.getComputeHandler(); };
            node.setPlotHandler = (handler) => {
                this.fDSPCode.setPlotHandler(handler);
            };
            node.getPlotHandler = () => { return this.fDSPCode.getPlotHandler(); };
            node.getNumInputs = () => { return this.fDSPCode.getNumInputs(); };
            node.getNumOutputs = () => { return this.fDSPCode.getNumOutputs(); };
            node.metadata = (handler) => { };
            node.midiMessage = (data) => { this.fDSPCode.midiMessage(data); };
            node.ctrlChange = (chan, ctrl, value) => { this.fDSPCode.ctrlChange(chan, ctrl, value); };
            node.pitchWheel = (chan, value) => { this.fDSPCode.pitchWheel(chan, value); };
            node.setParamValue = (path, value) => { this.fDSPCode.setParamValue(path, value); };
            node.getParamValue = (path) => { return this.fDSPCode.getParamValue(path); };
            node.getParams = () => { return this.fDSPCode.getParams(); };
            node.getJSON = () => { return this.fDSPCode.getJSON(); };
            node.getUI = () => { return this.fDSPCode.getUI(); };
            node.destroy = () => { this.fDSPCode.destroy(); };
        }
    }
    class FaustMonoScriptProcessorNodeImp extends FaustScriptProcessorNodeImp {
        init(context, instance, buffer_size) {
            const _super = Object.create(null, {
                setupNode: { get: () => super.setupNode }
            });
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    this.fDSPCode = instance;
                    let node = context.createScriptProcessor(buffer_size, this.fDSPCode.getNumInputs(), this.fDSPCode.getNumOutputs());
                    _super.setupNode.call(this, node);
                    return node;
                }
                catch (e) {
                    console.log("Error in FaustMonoScriptProcessorNodeImp createScriptProcessor: " + e.message);
                    return null;
                }
            });
        }
    }
    Faust.FaustMonoScriptProcessorNodeImp = FaustMonoScriptProcessorNodeImp;
    class FaustPolyScriptProcessorNodeImp extends FaustScriptProcessorNodeImp {
        init(context, instance, buffer_size) {
            const _super = Object.create(null, {
                setupNode: { get: () => super.setupNode }
            });
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    this.fDSPCode = instance;
                    let node = context.createScriptProcessor(buffer_size, this.fDSPCode.getNumInputs(), this.fDSPCode.getNumOutputs());
                    _super.setupNode.call(this, node);
                    node.keyOn = (channel, pitch, velocity) => {
                        this.fDSPCode.keyOn(channel, pitch, velocity);
                    };
                    node.keyOff = (channel, pitch, velocity) => {
                        this.fDSPCode.keyOff(channel, pitch, velocity);
                    };
                    node.allNotesOff = (hard) => {
                        this.fDSPCode.allNotesOff(hard);
                    };
                    return node;
                }
                catch (e) {
                    console.log("Error in FaustPolyScriptProcessorNodeImp createScriptProcessor: " + e.message);
                    return null;
                }
            });
        }
    }
    Faust.FaustPolyScriptProcessorNodeImp = FaustPolyScriptProcessorNodeImp;
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    function createSVGDiagrams(engine, name, dsp_code, args) {
        return new SVGDiagramsImp(engine, name, dsp_code, args);
    }
    Faust.createSVGDiagrams = createSVGDiagrams;
    class SVGDiagramsImp {
        constructor(engine, name, dsp_code, args) {
            this.fEngine = engine;
            let compiler = Faust.createCompiler(engine);
            this.fSuccess = compiler.generateAuxFiles(name, dsp_code, "-lang wasm -svg " + args);
            this.fError = (this.fSuccess) ? "" : compiler.getErrorMessage();
            this.fFolder = name + "-svg";
        }
        debug(path) {
            console.log("getSVG file: " + path);
            let content = this.fEngine.module().FS.readdir(".");
            console.log("getSVG dir: " + content);
        }
        error() { return this.fError; }
        success() { return this.fSuccess; }
        getSVG(name) {
            if (!name)
                name = this.fFolder + "/process.svg";
            if (this.fSuccess) {
                let path = name;
                try {
                    return this.fEngine.module().FS.readFile(path, { encoding: "utf8" });
                }
                catch (e) {
                    console.log("SVGDiagrams: can't read file " + path);
                    return "";
                }
            }
            else {
                return "SVGDiagrams: not a valid diagram: " + this.fError;
            }
        }
    }
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    function createAudioNodeFactory() { return new AudioNodeFactoryImp(); }
    Faust.createAudioNodeFactory = createAudioNodeFactory;
    class AudioNodeFactoryImp {
        constructor() {
            this.fWorkletProcessors = [];
        }
        compileMonoNode(context, name, compiler, dsp_code, args, sp, buffer_size) {
            return __awaiter(this, void 0, void 0, function* () {
                const factory = yield compiler.createMonoDSPFactory(name, dsp_code, args);
                return (factory) ? this.createMonoNode(context, name, factory, sp, buffer_size) : null;
            });
        }
        createMonoNode(context, name, factory, sp, buffer_size) {
            return __awaiter(this, void 0, void 0, function* () {
                if (sp) {
                    buffer_size = (buffer_size) ? buffer_size : 1024;
                    const instance = yield new Faust.GeneratorImp().createAsyncMonoDSPInstance(factory);
                    const mono_dsp = Faust.createMonoDSP(instance, context.sampleRate, buffer_size);
                    return new Faust.FaustMonoScriptProcessorNodeImp().init(context, mono_dsp, buffer_size);
                }
                else {
                    if (this.fWorkletProcessors.indexOf(name) === -1) {
                        try {
                            const processor_code = `
                            // Create a Faust namespace
                            let Faust = {};
                            // DSP name and JSON string for DSP are generated
                            const faustData = { dsp_name: '${name}', dsp_JSON: '${factory.json}' };
                            // Implementation needed classes of functions
                            ${Faust.BaseDSPImp.toString()}
                            ${Faust.MonoDSPImp.toString()}
                            ${Faust.GeneratorImp.toString()} 
                            ${Faust.InstanceAPIImpl.toString()} 
                            ${Faust.createMonoDSP.toString()} 
                            // Put them in Faust namespace
                            Faust.BaseDSPImp = BaseDSPImp;
                            Faust.MonoDSPImp = MonoDSPImp;
                            Faust.GeneratorImp = GeneratorImp;
                            Faust.createMonoDSP = createMonoDSP;
                            // Generate the actual AudioWorkletProcessor code
                            (${Faust.FaustAudioWorkletProcessorGenerator.toString()})(); `;
                            const url = window.URL.createObjectURL(new Blob([processor_code], { type: "text/javascript" }));
                            yield context.audioWorklet.addModule(url);
                            this.fWorkletProcessors.push(name);
                        }
                        catch (e) {
                            console.error("=> exception raised while running createMonoNode: " + e);
                            return null;
                        }
                    }
                    return new Faust.FaustMonoAudioWorkletNodeImp(context, name, factory);
                }
            });
        }
        createOfflineMonoProcessor(factory, sample_rate, buffer_size) {
            return __awaiter(this, void 0, void 0, function* () {
                const instance = yield new Faust.GeneratorImp().createAsyncMonoDSPInstance(factory);
                const mono_dsp = Faust.createMonoDSP(instance, sample_rate, buffer_size);
                return new Faust.FaustOfflineProcessorImp(mono_dsp, buffer_size);
            });
        }
        compilePolyNode(context, name, compiler, dsp_code, args, voices, sp, buffer_size) {
            return __awaiter(this, void 0, void 0, function* () {
                const voice_dsp = dsp_code;
                const effect_dsp = `adapt(1,1) = _; adapt(2,2) = _,_; adapt(1,2) = _ <: _,_; adapt(2,1) = _,_ :> _;
                                adaptor(F,G) = adapt(outputs(F),inputs(G));
                                dsp_code = environment{${dsp_code}};
                                process = adaptor(dsp_code.process, dsp_code.effect) : dsp_code.effect;`;
                return this.compilePolyNode2(context, name, compiler, voice_dsp, effect_dsp, args, voices, sp, buffer_size);
            });
        }
        compilePolyNode2(context, name, compiler, voices_dsp, effect_dsp, args, voices, sp, buffer_size) {
            return __awaiter(this, void 0, void 0, function* () {
                const voice_factory = yield compiler.createPolyDSPFactory(name, voices_dsp, args);
                if (!voice_factory)
                    return null;
                const effect_factory = yield compiler.createPolyDSPFactory(name, effect_dsp, args);
                const mixer_module = yield new Faust.GeneratorImp().loadDSPMixer('mixer32.wasm');
                return (mixer_module) ? this.createPolyNode(context, name, voice_factory, mixer_module, voices, sp, ((effect_factory) ? effect_factory : undefined), buffer_size) : null;
            });
        }
        createPolyNode(context, name_aux, voice_factory, mixer_module, voices, sp, effect_factory, buffer_size) {
            return __awaiter(this, void 0, void 0, function* () {
                const name = name_aux + "_poly";
                if (sp) {
                    buffer_size = (buffer_size) ? buffer_size : 1024;
                    const instance = yield new Faust.GeneratorImp().createAsyncPolyDSPInstance(voice_factory, mixer_module, voices, effect_factory);
                    const poly_dsp = Faust.createPolyDSP(instance, context.sampleRate, buffer_size);
                    return new Faust.FaustPolyScriptProcessorNodeImp().init(context, poly_dsp, buffer_size);
                }
                else {
                    if (this.fWorkletProcessors.indexOf(name) === -1) {
                        try {
                            const processor_code = `
                            // Create a Faust namespace
                            let Faust = {};
                            // DSP name and JSON strings for DSP and (possible) effect are generated
                            const faustData = { dsp_name: '${name}', dsp_JSON: '${voice_factory.json}', effect_JSON: '${(effect_factory) ? effect_factory.json : ""}'};
                            // Implementation needed classes of functions
                            ${Faust.BaseDSPImp.toString()}
                            ${Faust.PolyDSPImp.toString()}
                            ${Faust.DspVoice.toString()}
                            ${Faust.GeneratorImp.toString()} 
                            ${Faust.InstanceAPIImpl.toString()} 
                            ${Faust.createPolyDSP.toString()} 
                            // Put them in Faust namespace
                            Faust.BaseDSPImp = BaseDSPImp;
                            Faust.PolyDSPImp = PolyDSPImp;
                            Faust.GeneratorImp = GeneratorImp;
                            Faust.createPolyDSP = createPolyDSP;
                            // Generate the actual AudioWorkletProcessor code
                            (${Faust.FaustAudioWorkletProcessorGenerator.toString()})();`;
                            const url = window.URL.createObjectURL(new Blob([processor_code], { type: "text/javascript" }));
                            yield context.audioWorklet.addModule(url);
                            this.fWorkletProcessors.push(name);
                        }
                        catch (e) {
                            console.error("=> exception raised while running createPolyNode: " + e);
                            return null;
                        }
                    }
                    return new Faust.FaustPolyAudioWorkletNodeImp(context, name, voice_factory, mixer_module, voices, effect_factory);
                }
            });
        }
    }
    Faust.AudioNodeFactoryImp = AudioNodeFactoryImp;
})(Faust || (Faust = {}));
var Faust;
(function (Faust) {
    function createLibFaust(engine) {
        return new LibFaustImp(engine);
    }
    Faust.createLibFaust = createLibFaust;
    class LibFaustImp {
        constructor(engine) {
            this.fModule = engine;
            this.fEngine = new engine.libFaustWasm();
        }
        version() { return this.fEngine.version(); }
        createDSPFactory(name, dsp_code, args, internal_memory) { return this.fEngine.createDSPFactory(name, dsp_code, args, internal_memory); }
        deleteDSPFactory(cfactory) { this.fEngine.deleteDSPFactory(cfactory); }
        expandDSP(name, dsp_code, args) { return this.fEngine.expandDSP(name, dsp_code, args); }
        generateAuxFiles(name, dsp_code, args) { return this.fEngine.generateAuxFiles(name, dsp_code, args); }
        deleteAllDSPFactories() { this.fEngine.deleteAllDSPFactories(); }
        getErrorAfterException() { return this.fEngine.getErrorAfterException(); }
        cleanupAfterException() { this.fEngine.cleanupAfterException(); }
        module() { return this.fModule; }
        toString() { return "LibFaust module: " + this.fModule + " engine: " + this.fEngine; }
    }
    Faust.LibFaustImp = LibFaustImp;
})(Faust || (Faust = {}));
