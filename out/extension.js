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
function activate(context) {
    const provider = new MCPViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("mcpsearchView", provider));
}
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
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        // Escuchar mensajes del webview
        this._view.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'sendMessage':
                    this.sendTelegramMessage(message.text);
                    return;
            }
        }, undefined, this._context.subscriptions);
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
    </head>
    <body>
        <h2>Enviar Notificacion al TEAM</h2>
        <textarea id="messageTextarea" placeholder="Escribe tu mensaje..."></textarea>
        <br/>
        <button id="sendButton">Enviar</button>

        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const sendButton = document.getElementById('sendButton');
            const messageTextarea = document.getElementById('messageTextarea');
            
            const userName = '${userName}';
            
            sendButton.addEventListener('click', () => {
                const text = messageTextarea.value;
                
                // --- CAMBIO AQUÍ ---
                // Se usa una plantilla de cadena de JavaScript (con acentos graves)
                const fullMessage = \`Usuario: \${userName}\n\nMensaje desde Visual Studio Code:\n\n\${text}\`;

                vscode.postMessage({
                    command: 'sendMessage',
                    text: fullMessage
                });
            });
        </script>
    </body>
    </html>`;
    }
    getUserName() {
        // Obtener el nombre de usuario del sistema operativo
        // En algunos sistemas operativos, es 'USER' o 'USERNAME'
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
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map