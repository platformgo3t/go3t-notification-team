import * as vscode from 'vscode';
import * as os from 'os';
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";


let tgClient: TelegramClient | null = null;
let messageHistory: string[] = []; // Historial de mensajes

export async function activate(context: vscode.ExtensionContext) {
    const provider = new MCPViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("mcpsearchView", provider)
    );

    await initTelegramClient();

    if (tgClient) {
        tgClient.addEventHandler(async (event: NewMessageEvent) => {
            const message = event.message;
            const chat = await message.getChat();
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
        }, new NewMessage({}));
    }

}
export function deactivate() { }

async function initTelegramClient() {
    const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
    const apiId = config.get<number>('apiId') || 0;
    const apiHash = config.get<string>('apiHash') || "";
    const phoneNumber = config.get<string>('phoneNumber') || "";

    if (!apiId || !apiHash || !phoneNumber) {
        vscode.window.showErrorMessage('Configura apiId, apiHash y phoneNumber en las opciones de la extensión.');
        return;
    }

    const stringSession = new StringSession(""); // Aquí podrías guardar sesión persistente
    tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    await tgClient.start({
        phoneNumber: async () => phoneNumber,
        password: async (hint?: string) => {
            const result = await vscode.window.showInputBox({
                prompt: hint || "Introduce tu contraseña 2FA (si tienes):",
                password: true
            });
            return result ?? ""; // Si el usuario cancela, devuelve ""
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

    vscode.window.showInformationMessage("Sesión de Telegram iniciada como usuario.");
}

class MCPViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
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

        this._view.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'sendMessage') {
                    this.sendTelegramMessage(message.text);
                }
            },
            undefined,
            this._context.subscriptions
        );
    }


    public postMessageToWebview(message: any) {
        this._view?.webview.postMessage(message);
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
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
        } catch (err) {
            vscode.window.showErrorMessage(`Error enviando mensaje: ${err}`);
        }
    }

}

function getNonce() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
