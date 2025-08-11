## Go3t Notification Team

Esta es una extensión de Visual Studio Code que te permite enviar notificaciones rápidas a un equipo de Telegram. Con un panel lateral dedicado, puedes escribir un mensaje y enviarlo al instante al chat de tu equipo, incluyendo automáticamente tu nombre de usuario para una mejor trazabilidad.

### Características

- Envío de Mensajes a Telegram: Envía mensajes de texto directamente a un grupo o tópico específico de Telegram.

- Identificación Automática: El mensaje incluye tu nombre de usuario de VS Code, para que el equipo sepa quién está enviando la notificación.

- Integración en el IDE: El panel de la extensión se integra de forma nativa en la barra de actividad de VS Code.



### Configuración

Para usar esta extensión, necesitas configurar tu bot de Telegram y obtener el ID del grupo y del tópico.

- API ID de Telegram para la sesión de usuario.

- API Hash de Telegram para la sesión de usuario.

- El número de teléfono para la sesión de usuario en Telegram. ej: 535xxxxxxx.

- El ID del grupo de Telegram donde se enviarán los mensajes.


### Configurar en VS Code:

En VS Code, ve a Archivo > Preferencias > Configuración (o Code > Settings en macOS).

Busca **Go3t Notification Team** en el cuadro de búsqueda.

Introduce tu botToken, groupId y, si es necesario, el topicId en los campos correspondientes.

### Instalación

- Descarga el archivo .vsix de la página de releases de este repositorio.

- En VS Code, ve al panel de Extensiones (Ctrl+Shift+X).

- Haz clic en el menú ... y selecciona "Install from VSIX...".

- Selecciona el archivo .vsix que descargaste.

### Construcción y Empaquetado

Si deseas compilar la extensión por tu cuenta, sigue estos pasos:

#### Clona el repositorio:
```Bash
git clone https://github.com/tu-usuario/tu-repositorio.git
cd tu-repositorio
```

#### Instala las dependencias:
```Bash
npm install
```

#### Compila el código TypeScript a JavaScript:
```Bash
npm run compile
```

#### Empaqueta la extensión en un archivo .vsix:
```Bash
vsce package
```

## Colaboración

¡Las contribuciones son bienvenidas! Si encuentras un error o tienes una sugerencia, por favor, abre un issue o envía un pull request en GitHub.

## Licencia

El nombre de la licencia (por ejemplo, MIT)