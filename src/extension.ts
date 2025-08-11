import * as vscode from 'vscode';
import * as os from 'os';
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";

let tgClient: TelegramClient | null = null;
let messageHistory: string[] = [];
let unreadCount = 0;

export async function activate(context: vscode.ExtensionContext) {
    const storedHistory = context.globalState.get<string[]>('messageHistory');
    if (storedHistory) {
        messageHistory = storedHistory;
    }

    const provider = new MCPViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("mcpsearchView", provider)
    );

    await initTelegramClient(context);

    if (tgClient) {
        tgClient.addEventHandler(async (event: NewMessageEvent) => {
            const message = event.message;
            const chat = await message.getChat();

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

                await context.globalState.update('messageHistory', messageHistory);
                
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
        }, new NewMessage({}));
    }
}

export function deactivate() {}

async function initTelegramClient(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
    const apiId = config.get<number>('apiId') || 0;
    const apiHash = config.get<string>('apiHash') || "";
    const phoneNumber = config.get<string>('phoneNumber') || "";

    if (!apiId || !apiHash || !phoneNumber) {
        vscode.window.showErrorMessage('Configura apiId, apiHash y phoneNumber en las opciones de la extensión.');
        return;
    }

    const sessionString = context.globalState.get<string>('telegramSession') || '';
    const stringSession = new StringSession(sessionString);
    tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    try {
        await tgClient.start({
            phoneNumber: async () => phoneNumber,
            password: async (hint?: string) => {
                const result = await vscode.window.showInputBox({
                    prompt: hint || "Introduce tu contraseña 2FA (si tienes):",
                    password: true
                });
                return result ?? "";
            },
            phoneCode: async (isCodeViaApp?: boolean) => {
                const result = await vscode.window.showInputBox({
                    prompt: isCodeViaApp
                        ? "Introduce el código enviado por la app Telegram:"
                        : "Introduce el código enviado por SMS:"
                });
                return result ?? "";
            },
            onError: (err) => console.error(err),
        });

        if (await tgClient.isUserAuthorized()) {
            const newSessionString = stringSession.save();
            await context.globalState.update('telegramSession', newSessionString);
            vscode.window.showInformationMessage("Sesión de Telegram guardada y usuario autorizado.");
        } else {
            vscode.window.showInformationMessage("Sesión de Telegram iniciada como usuario, pero no autorizada.");
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error al iniciar sesión en Telegram: ${error}`);
    }
}

class MCPViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        };

        this._view.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'sendMessage') {
                    this.sendTelegramMessage(message.text);
                }
                 if (message.command === 'markAsRead') {
                    unreadCount = 0;
                    this.updateBadge(unreadCount);
                }
            },
            undefined,
            this._context.subscriptions
        );

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        
        // La lógica de reseteo se activa cuando la visibilidad cambia a visible
        this._view.onDidChangeVisibility(() => {
            if (this._view?.visible) {
                unreadCount = 0;
                this.updateBadge(unreadCount);
                this.postMessageToWebview({
                    command: 'updateMessages',
                    messages: messageHistory
                });
            }
        });
    }

    public isVisible(): boolean {
        return !!this._view?.visible;
    }

    public updateBadge(count: number) {
        if (this._view) {
            if (count > 0) {
                this._view.badge = { value: count, tooltip: `${count} mensajes nuevos` };
            } else {
                this._view.badge = undefined;
            }
        }
    }

    public postMessageToWebview(message: any) {
        this._view?.webview.postMessage(message);
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
    </head>
    <body>
        <h2>Notificaciones del TEAM</h2>
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

    private getUserName(): string {
        return os.userInfo().username || 'Usuario';
    }

    private async sendTelegramMessage(text: string) {
        if (!tgClient) {
            vscode.window.showErrorMessage('No hay sesión activa de Telegram.');
            return;
        }

        const groupId = vscode.workspace.getConfiguration('mcpsearch.telegram').get<string>('groupId');
        if (!groupId) {
            vscode.window.showErrorMessage('Configura el ID del grupo en las opciones de la extensión.');
            return;
        }

        try {
            await tgClient.sendMessage(groupId, { message: text });

            const now = new Date();
            const formattedTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const formattedMessage = `[${formattedTime}] Tú: ${text}`;

            messageHistory.push(formattedMessage);
            if (messageHistory.length > 10) {
                messageHistory = messageHistory.slice(-10);
            }

            await this._context.globalState.update('messageHistory', messageHistory);

            this.postMessageToWebview({
                command: 'updateMessages',
                messages: messageHistory
            });

            vscode.window.showInformationMessage('Mensaje enviado.');
        } catch (err) {
            vscode.window.showErrorMessage(`Error enviando mensaje: ${err}`);
        }
    }
}

function getNonce() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}