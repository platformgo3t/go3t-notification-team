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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const node_fetch_1 = require("node-fetch");
const os = require("os");
let lastUpdateId = 0;
let messageHistory = []; // Almacena el historial de mensajes
function activate(context) {
    const provider = new MCPViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("mcpsearchView", provider));
    let intervalId = setInterval(() => {
        if (provider.isPanelActive()) {
            readNewTelegramMessages(provider);
        }
    }, 2000);
    context.subscriptions.push({
        dispose: () => clearInterval(intervalId)
    });
}
function deactivate() { }
class MCPViewProvider {
    constructor(_context) {
        this._context = _context;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        };
        // Cargar los últimos 10 mensajes al iniciar el panel
        readNewTelegramMessages(this, true);
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        this._view.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'sendMessage':
                    this.sendTelegramMessage(message.text);
                    return;
                case 'requestMessages':
                    readNewTelegramMessages(this);
                    return;
            }
        }, undefined, this._context.subscriptions);
    }
    postMessageToWebview(message) {
        var _a;
        (_a = this._view) === null || _a === void 0 ? void 0 : _a.webview.postMessage(message);
    }
    isPanelActive() {
        var _a;
        return !!((_a = this._view) === null || _a === void 0 ? void 0 : _a.visible);
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
            <title>Panel Go3t</title>
            <style>
                button img {
                    vertical-align: middle;
                    margin-right: 5px;
                    width: 16px;
                    height: 16px;
                }
            </style>
        </head>
        <body>
            <h2>Mensajes de Telegram</h2>
            <button id="refreshButton">Actualizar Mensajes</button>
            <div id="messageContainer"></div>

            <hr>

            <h2>Enviar Notificacion al TEAM</h2>
            <textarea id="messageTextarea" placeholder="Escribe tu mensaje..."></textarea>
            <br/>
            <button id="sendButton">Enviar</button>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const sendButton = document.getElementById('sendButton');
                const refreshButton = document.getElementById('refreshButton');
                const messageTextarea = document.getElementById('messageTextarea');
                const messageContainer = document.getElementById('messageContainer');
                
                const userName = '${userName}';
                
                function sendMessage() {
                    const text = messageTextarea.value;
                    if (text.trim() === '') return;
                    const fullMessage = \`Usuario: \${userName}\n\nMensaje desde Visual Studio Code:\n\n\${text}\`;
                    vscode.postMessage({
                        command: 'sendMessage',
                        text: fullMessage
                    });
                    messageTextarea.value = '';
                }

                sendButton.addEventListener('click', sendMessage);

                messageTextarea.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                    }
                });

                refreshButton.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'requestMessages'
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateMessages') {
                        messageContainer.innerHTML = '';
                        message.messages.forEach(msg => {
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
        return os.userInfo().username || 'Usuario Desconocido';
    }
    sendTelegramMessage(text) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
            const token = config.get('botToken');
            const groupId = config.get('groupId');
            const topicId = config.get('topicId');
            if (!token || !groupId) {
                vscode.window.showErrorMessage('Por favor, configura el token del bot y el ID del grupo en las configuraciones de la extensión.');
                return;
            }
            try {
                const url = `https://api.telegram.org/bot${token}/sendMessage`;
                const body = {
                    chat_id: groupId,
                    text: text,
                };
                if (topicId) {
                    body.message_thread_id = topicId;
                }
                const response = yield (0, node_fetch_1.default)(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                });
                if (!response.ok) {
                    const errorText = yield response.text();
                    throw new Error(`Error al enviar mensaje: ${response.status} - ${errorText}`);
                }
                vscode.window.showInformationMessage('Mensaje enviado con éxito a Telegram.');
            }
            catch (error) {
                vscode.window.showErrorMessage(`Error al enviar mensaje a Telegram: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
}
function readNewTelegramMessages(provider_1) {
    return __awaiter(this, arguments, void 0, function* (provider, isInitialLoad = false) {
        var _a, _b;
        const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
        const token = config.get('botToken');
        const groupId = config.get('groupId');
        if (!token || !groupId) {
            return;
        }
        try {
            let url = `https://api.telegram.org/bot${token}/getUpdates`;
            if (!isInitialLoad) {
                url += `?offset=${lastUpdateId + 1}`;
            }
            else {
                // Carga los 10 mensajes más recientes al iniciar
                url += `?limit=10`;
            }
            const response = yield (0, node_fetch_1.default)(url);
            if (!response.ok) {
                return;
            }
            const data = yield response.json();
            const newMessages = [];
            if (data.result && data.result.length > 0) {
                for (const update of data.result) {
                    lastUpdateId = update.update_id;
                    const message = update.message;
                    // Filtra para que solo se muestren los mensajes del grupo
                    if (message && message.chat.id.toString() === groupId) {
                        // Identifica al remitente, incluyendo los mensajes del bot
                        const from = ((_a = message.from) === null || _a === void 0 ? void 0 : _a.is_bot) ? 'Bot de la Extensión' : (((_b = message.from) === null || _b === void 0 ? void 0 : _b.first_name) || 'Desconocido');
                        const text = message.text || '[Mensaje sin texto]';
                        // Crea una notificación para los mensajes nuevos
                        vscode.window.showInformationMessage(`Go3t - : [${from}] ${text}`);
                        const messageDate = new Date(message.date * 1000);
                        const formattedTime = messageDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        newMessages.push(`[${formattedTime}] ${from}: ${text}`);
                    }
                }
                // Unir los mensajes nuevos al historial existente
                messageHistory = messageHistory.concat(newMessages);
                // Mantener solo los últimos 10 mensajes
                if (messageHistory.length > 10) {
                    messageHistory = messageHistory.slice(messageHistory.length - 10);
                }
                // Enviar el historial completo al webview
                provider.postMessageToWebview({
                    command: 'updateMessages',
                    messages: messageHistory
                });
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error al leer mensajes de Telegram: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=extension.js.map