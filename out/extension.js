"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("os"));
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const events_1 = require("telegram/events");
let tgClient = null;
let messageHistory = []; // Historial de mensajes
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = new MCPViewProvider(context);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider("mcpsearchView", provider));
        yield initTelegramClient();
        if (tgClient) {
            tgClient.addEventHandler((event) => __awaiter(this, void 0, void 0, function* () {
                const message = event.message;
                const chat = yield message.getChat();
                // const groupId = vscode.workspace.getConfiguration('mcpsearch.telegram').get<string>('groupId');
                // if (!groupId) return;
                if (chat && chat.id.toString()) {
                    const sender = message.sender;
                    let from = "Desconocido";
                    if (sender) {
                        // @ts-ignore
                        from = sender.firstName || sender.username || "Desconocido";
                    }
                    const text = message.message || "[Mensaje sin texto]";
                    const formattedTime = new Date(message.date * 1000)
                        .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    const formattedMessage = `[${formattedTime}] ${from}: ${text}`;
                    messageHistory.push(formattedMessage);
                    if (messageHistory.length > 10) {
                        messageHistory = messageHistory.slice(-10);
                    }
                    // Actualizar el Webview con los mensajes
                    provider.postMessageToWebview({
                        command: 'updateMessages',
                        messages: messageHistory
                    });
                    // Mostrar notificación con el mensaje recibido
                    vscode.window.showInformationMessage(`Nuevo mensaje de ${from}: ${text}`);
                }
            }), new events_1.NewMessage({}));
        }
    });
}
function deactivate() { }
function initTelegramClient() {
    return __awaiter(this, void 0, void 0, function* () {
        const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
        const apiId = config.get('apiId') || 0;
        const apiHash = config.get('apiHash') || "";
        const phoneNumber = config.get('phoneNumber') || "";
        if (!apiId || !apiHash || !phoneNumber) {
            vscode.window.showErrorMessage('Configura apiId, apiHash y phoneNumber en las opciones de la extensión.');
            return;
        }
        const stringSession = new sessions_1.StringSession(""); // Aquí podrías guardar sesión persistente
        tgClient = new telegram_1.TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
        yield tgClient.start({
            phoneNumber: () => __awaiter(this, void 0, void 0, function* () { return phoneNumber; }),
            password: (hint) => __awaiter(this, void 0, void 0, function* () {
                const result = yield vscode.window.showInputBox({
                    prompt: hint || "Introduce tu contraseña 2FA (si tienes):",
                    password: true
                });
                return result !== null && result !== void 0 ? result : ""; // Si el usuario cancela, devuelve ""
            }),
            phoneCode: (isCodeViaApp) => __awaiter(this, void 0, void 0, function* () {
                const result = yield vscode.window.showInputBox({
                    prompt: isCodeViaApp
                        ? "Introduce el código enviado por la app Telegram:"
                        : "Introduce el código enviado por SMS:"
                });
                return result !== null && result !== void 0 ? result : "";
            }),
            onError: (err) => console.error(err),
        });
        vscode.window.showInformationMessage("Sesión de Telegram iniciada como usuario.");
    });
}
class MCPViewProvider {
    constructor(_context) {
        this._context = _context;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        };
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        // Envía los mensajes actuales al abrir la vista
        this.postMessageToWebview({
            command: 'updateMessages',
            messages: messageHistory
        });
        this._view.webview.onDidReceiveMessage(message => {
            if (message.command === 'sendMessage') {
                this.sendTelegramMessage(message.text);
            }
        }, undefined, this._context.subscriptions);
    }
    postMessageToWebview(message) {
        var _a;
        (_a = this._view) === null || _a === void 0 ? void 0 : _a.webview.postMessage(message);
    }
    getHtmlForWebview(webview) {
        const userName = this.getUserName();
        const nonce = getNonce();
        return `<!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <style>
                body { font-family: sans-serif; padding: 10px; }
                #messageContainer { max-height: 300px; overflow-y: auto; }
                textarea { width: 100%; height: 50px; }
                button { margin-top: 5px; }
            </style>
        </head>
        <body>
            <h2>Mensajes de Telegram</h2>
            <div id="messageContainer"></div>
            <hr>
            <h2>Enviar mensaje</h2>
            <textarea id="messageTextarea" placeholder="Escribe tu mensaje..."></textarea>
            <br/>
            <button id="sendButton">Enviar</button>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const sendButton = document.getElementById('sendButton');
                const messageTextarea = document.getElementById('messageTextarea');
                const messageContainer = document.getElementById('messageContainer');
                
                sendButton.addEventListener('click', () => {
                    const text = messageTextarea.value;
                    if (text.trim()) {
                        vscode.postMessage({ command: 'sendMessage', text });
                        messageTextarea.value = '';
                    }
                });

                window.addEventListener('message', event => {
                    if (event.data.command === 'updateMessages') {
                        messageContainer.innerHTML = '';
                        event.data.messages.forEach(msg => {
                            const p = document.createElement('p');
                            p.textContent = msg;
                            messageContainer.appendChild(p);
                        });
                    }
                });
            </script>
        </body>
        </html>`;
    }
    getUserName() {
        return os.userInfo().username || 'Usuario';
    }
    sendTelegramMessage(text) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!tgClient) {
                vscode.window.showErrorMessage('No hay sesión activa de Telegram.');
                return;
            }
            const groupId = vscode.workspace.getConfiguration('mcpsearch.telegram').get('groupId');
            if (!groupId) {
                vscode.window.showErrorMessage('Configura el ID del grupo en las opciones de la extensión.');
                return;
            }
            try {
                yield tgClient.sendMessage(groupId, { message: text });
                // Agregar mensaje enviado al historial con "Tú" como remitente
                const now = new Date();
                const formattedTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const formattedMessage = `[${formattedTime}] Tú: ${text}`;
                messageHistory.push(formattedMessage);
                if (messageHistory.length > 10) {
                    messageHistory = messageHistory.slice(-10);
                }
                // Actualizar el webview con el nuevo mensaje
                this.postMessageToWebview({
                    command: 'updateMessages',
                    messages: messageHistory
                });
                vscode.window.showInformationMessage('Mensaje enviado.');
            }
            catch (err) {
                vscode.window.showErrorMessage(`Error enviando mensaje: ${err}`);
            }
        });
    }
}
function getNonce() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
//# sourceMappingURL=extension.js.map