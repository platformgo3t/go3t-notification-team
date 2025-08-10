import * as vscode from 'vscode';
import fetch from 'node-fetch';
import * as os from 'os';

let lastUpdateId = 0;
let messageHistory: string[] = []; // Almacena el historial de mensajes

export function activate(context: vscode.ExtensionContext) {
    const provider = new MCPViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("mcpsearchView", provider)
    );

    let intervalId = setInterval(() => {
        if (provider.isPanelActive()) {
            readNewTelegramMessages(provider);
        }
    }, 2000);

    context.subscriptions.push({
        dispose: () => clearInterval(intervalId)
    });
}

export function deactivate() { }

class MCPViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        };

        // Cargar los últimos 10 mensajes al iniciar el panel
        readNewTelegramMessages(this, true);

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        this._view.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'sendMessage':
                        this.sendTelegramMessage(message.text);
                        return;
                    case 'requestMessages':
                        readNewTelegramMessages(this);
                        return;
                }
            },
            undefined,
            this._context.subscriptions
        );
    }

    public postMessageToWebview(message: any) {
        this._view?.webview.postMessage(message);
    }

    public isPanelActive(): boolean {
        return !!this._view?.visible;
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
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

    private getUserName(): string {
        return os.userInfo().username || 'Usuario Desconocido';
    }

    private async sendTelegramMessage(text: string) {
        const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
        const token = config.get<string>('botToken');
        const groupId = config.get<string>('groupId');
        const topicId = config.get<string>('topicId');

        if (!token || !groupId) {
            vscode.window.showErrorMessage('Por favor, configura el token del bot y el ID del grupo en las configuraciones de la extensión.');
            return;
        }

        try {
            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const body: { [key: string]: string } = {
                chat_id: groupId,
                text: text,
            };

            if (topicId) {
                body.message_thread_id = topicId;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error al enviar mensaje: ${response.status} - ${errorText}`);
            }

            vscode.window.showInformationMessage('Mensaje enviado con éxito a Telegram.');
        } catch (error) {
            vscode.window.showErrorMessage(`Error al enviar mensaje a Telegram: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

async function readNewTelegramMessages(provider: MCPViewProvider, isInitialLoad = false) {
    const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
    const token = config.get<string>('botToken');
    const groupId = config.get<string>('groupId');

    if (!token || !groupId) {
        return;
    }

    try {
        let url = `https://api.telegram.org/bot${token}/getUpdates`;
        if (!isInitialLoad) {
            url += `?offset=${lastUpdateId + 1}`;
        } else {
            // Carga los 10 mensajes más recientes al iniciar
            url += `?limit=10`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        const newMessages: string[] = [];

        if (data.result && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;

                const message = update.message;
                // Filtra para que solo se muestren los mensajes del grupo
                if (message && message.chat.id.toString() === groupId) {
                    // Identifica al remitente, incluyendo los mensajes del bot
                    const from = message.from?.is_bot ? 'Bot de la Extensión' : (message.from?.first_name || 'Desconocido');
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
    } catch (error) {
        vscode.window.showErrorMessage(`Error al leer mensajes de Telegram: ${error instanceof Error ? error.message : String(error)}`);
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