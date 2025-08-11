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
let messageHistory = [];
let unreadCount = 0;
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const storedHistory = context.globalState.get('messageHistory');
        if (storedHistory) {
            messageHistory = storedHistory;
        }
        const provider = new MCPViewProvider(context);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider("mcpsearchView", provider));
        yield initTelegramClient(context);
        if (tgClient) {
            tgClient.addEventHandler((event) => __awaiter(this, void 0, void 0, function* () {
                const message = event.message;
                const chat = yield message.getChat();
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
                    yield context.globalState.update('messageHistory', messageHistory);
                    if (!provider.isVisible()) {
                        unreadCount++;
                        provider.updateBadge(unreadCount);
                    }
                    provider.postMessageToWebview({
                        command: 'updateMessages',
                        messages: messageHistory
                    });
                    vscode.window.showInformationMessage(`Nuevo mensaje de ${from}: ${text}`);
                }
            }), new events_1.NewMessage({}));
        }
    });
}
function deactivate() { }
function initTelegramClient(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
        const apiId = config.get('apiId') || 0;
        const apiHash = config.get('apiHash') || "";
        const phoneNumber = config.get('phoneNumber') || "";
        if (!apiId || !apiHash || !phoneNumber) {
            vscode.window.showErrorMessage('Configura apiId, apiHash y phoneNumber en las opciones de la extensión.');
            return;
        }
        const sessionString = context.globalState.get('telegramSession') || '';
        const stringSession = new sessions_1.StringSession(sessionString);
        tgClient = new telegram_1.TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
        try {
            yield tgClient.start({
                phoneNumber: () => __awaiter(this, void 0, void 0, function* () { return phoneNumber; }),
                password: (hint) => __awaiter(this, void 0, void 0, function* () {
                    const result = yield vscode.window.showInputBox({
                        prompt: hint || "Introduce tu contraseña 2FA (si tienes):",
                        password: true
                    });
                    return result !== null && result !== void 0 ? result : "";
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
            if (yield tgClient.isUserAuthorized()) {
                const newSessionString = stringSession.save();
                yield context.globalState.update('telegramSession', newSessionString);
                vscode.window.showInformationMessage("Sesión de Telegram guardada y usuario autorizado.");
            }
            else {
                vscode.window.showInformationMessage("Sesión de Telegram iniciada como usuario, pero no autorizada.");
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error al iniciar sesión en Telegram: ${error}`);
        }
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
        this._view.webview.onDidReceiveMessage(message => {
            if (message.command === 'sendMessage') {
                this.sendTelegramMessage(message.text);
            }
            if (message.command === 'markAsRead') {
                unreadCount = 0;
                this.updateBadge(unreadCount);
            }
        }, undefined, this._context.subscriptions);
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        // La lógica de reseteo se activa cuando la visibilidad cambia a visible
        this._view.onDidChangeVisibility(() => {
            var _a;
            if ((_a = this._view) === null || _a === void 0 ? void 0 : _a.visible) {
                unreadCount = 0;
                this.updateBadge(unreadCount);
                this.postMessageToWebview({
                    command: 'updateMessages',
                    messages: messageHistory
                });
            }
        });
    }
    isVisible() {
        var _a;
        return !!((_a = this._view) === null || _a === void 0 ? void 0 : _a.visible);
    }
    updateBadge(count) {
        if (this._view) {
            if (count > 0) {
                this._view.badge = { value: count, tooltip: `${count} mensajes nuevos` };
            }
            else {
                this._view.badge = undefined;
            }
        }
    }
    postMessageToWebview(message) {
        var _a;
        (_a = this._view) === null || _a === void 0 ? void 0 : _a.webview.postMessage(message);
    }
    getHtmlForWebview(webview) {
        const userName = this.getUserName();
        const nonce = getNonce();
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.css'));
        return `<!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
    </head>
    <body>
        <h2>Mensajes de Telegram</h2>
        <div id="messageContainer"></div>
        <div id="inputArea">
            <textarea id="messageTextarea" placeholder="Escribe tu mensaje..."></textarea>
            <button id="sendButton">Enviar</button>
            <button id="readButton">Leído</button>
        </div>
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const sendButton = document.getElementById('sendButton');
            const readButton = document.getElementById('readButton');
            const messageTextarea = document.getElementById('messageTextarea');
            const messageContainer = document.getElementById('messageContainer');

            function sendMessage() {
                const text = messageTextarea.value;
                if (text.trim()) {
                    vscode.postMessage({ command: 'sendMessage', text });
                    messageTextarea.value = '';
                    messageTextarea.focus();
                }
            }

            sendButton.addEventListener('click', () => {
                sendMessage();
            });
            
            readButton.addEventListener('click', () => {
                vscode.postMessage({ command: 'markAsRead' });
            });

            messageTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
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
                    messageContainer.scrollTop = messageContainer.scrollHeight;
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
                const now = new Date();
                const formattedTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const formattedMessage = `[${formattedTime}] Tú: ${text}`;
                messageHistory.push(formattedMessage);
                if (messageHistory.length > 10) {
                    messageHistory = messageHistory.slice(-10);
                }
                yield this._context.globalState.update('messageHistory', messageHistory);
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