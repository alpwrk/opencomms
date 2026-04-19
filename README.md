# OpenComms

OpenComms is a self hostable, semi E2EE Chat App

OpenComms room and user passwords are completely encrypted such as all of the messages inside a chatroom.

## Installation

Before the installation please make sure you have [git](https://git-scm.com/install/) and [pip](https://pip.pypa.io/en/stable/) installed on your machine.

Clone the github repository and cd into it.

```bash
git clone https://github.com/alpwrk/opencomms.git
cd opencomms
```

Use the package manager [pip](https://pip.pypa.io/en/stable/) to install the required python packages.

```bash
pip install flask flask-socketio tinydb bcrypt --break-system-packages
```
