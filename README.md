# Faust Editor
The online  [Faust Editor](https://fausteditor.grame.fr) can be used to _edit_, _compile_ and _run_ Faust code from any recent Web Browser with [WebAssembly](http://webassembly.org) support. It works completely on the client side and it is therefore very convenient for situations with many simultaneous users (workshops, classrooms, etc.). It embeds the latest version of the Faust compiler with an efficient webassembly backend and offers polyphonic MIDI support.

![](/images/editor-help.png)

## Features

The editor engine is based on [CodeMirror](https://codemirror.net/). It provides _syntax highlighting_, _auto completion_ and direct access to the _online documentation_. The documentation command (ctrl-d) uses the function name at the cursor position to locate to the relevant information.

![](/images/editor-doc.png)

## Recommended Browsers

The recommended browsers are the latest versions of Firefox and Chrome.

## Useful links

- [https://fausteditor.grame.fr](https://fausteditor.grame.fr): the official link on the Faust Editor website. 
- [https://github.com/grame-cncm/fausteditor](https://github.com/grame-cncm/fausteditor): the github repository

## Development

### Notes
We use [Vite](https://vitejs.dev/) for development mode and builds. Dependencies include [CodeMirror](https://codemirror.net/5/) for providing an editor, [FaustWasm](https://github.com/Fr0stbyteR/faustwasm) for compiling Faust client-side, and [FaustUI](https://github.com/Fr0stbyteR/faust-ui) for rendering widgets.

### Setup
Clone and enter the repository, then run:
```bash
npm install
```

### Run in development mode (automatic reloading)
```bash
npm run dev
```
Then press <kbd>o</kbd> to open in a browser.

### Build
``` shell
npm run build
```
Generates output in `dist/`. To view locally, run
``` shell
cd dist
python -m http.server
```
