# Sistema de gestió i distribució de contingut multimèdia descentralitzat

Pràctica de l'assignatura **Gestió i Distribució de la Informació
Empresarial (21753)**.

Aquest projecte implementa un sistema web que permet registrar,
emmagatzemar i distribuir contingut multimèdia utilitzant tecnologies
**web3 i infraestructures distribuïdes**.

# 👥 Informació del grup

**Nom del grup:**\
\> Escriu aquí el nom del grup

**Membres del grup:**

| Nom | Usuari GitHub |
|----|----|
| Rafel Mulet Serna | @rafelmulet |
| Juana Maria Luna Carvajal | @gambaLunatica |

# 📖 Descripció del projecte

Aquest sistema permet:

-   Registrar contingut multimèdia (àudio o vídeo)
-   Emmagatzemar el fitxer a **IPFS**
-   Registrar les **metadades i permisos d'accés** mitjançant un **smart
    contract**
-   Visualitzar i reproduir el contingut mitjançant una **aplicació
    web**

El sistema segueix una arquitectura distribuïda basada en blockchain.

# 🏗 Arquitectura del sistema

El sistema està compost per **tres components principals**:

Frontend (React) → Smart Contract (Solidity) → IPFS

### Components

#### Frontend

Aplicació web desenvolupada amb:

-   React
-   HTML5 video/audio player
-   Integració amb wallet Ethereum

Permet:

-   Pujar contingut
-   Visualitzar metadades
-   Reproduir contingut multimèdia

#### Smart Contract

Contracte desenvolupat amb **Solidity** que gestiona:

-   Registre de contingut
-   Propietari del contingut
-   Control bàsic d'accés
-   Enllaç amb el **CID d'IPFS**

#### IPFS

Sistema d'emmagatzematge distribuït utilitzat per:

-   Emmagatzemar el fitxer multimèdia
-   Generar un **CID (Content Identifier)**

Aquest CID és el que s'emmagatzema al smart contract.

# ⚙️ Funcionalitats implementades

## Smart Contract

-   [ ] Registrar contingut multimèdia
-   [ ] Emmagatzemar CID
-   [ ] Guardar metadades
-   [ ] Control d'accés bàsic
-   [ ] Identificar propietari

## IPFS

-   [ ] Pujada de fitxers
-   [ ] Obtenció del CID
-   [ ] Accés al contingut via gateway

## Frontend

-   [ ] Formulari d'alta de contingut
-   [ ] Pujada a IPFS
-   [ ] Llista de continguts
-   [ ] Visualització de metadades
-   [ ] Reproductor multimèdia

# 📝 Metadades del contingut

Cada contingut multimèdia inclou:

| Camp | Descripció |
|----|----|
| CID | Identificador IPFS |
| Títol | Nom del contingut |
| Autor | Autor del contingut |
| Descripció | (Opcional) |
| Categoria | (Opcional) |
| Thumbnail | (Opcional) |

# 🧰 Stack tecnològic

Tecnologies utilitzades al projecte:

| Tecnologia | Ús |
|----|----|
| React | Frontend |
| Solidity | Smart contract |
| IPFS | Emmagatzematge distribuït |
| MetaMask / Wallet | Identificació d'usuari |
| Hardhat | Desenvolupament de smart contracts |

# 🚀 Instruccions d'execució

## 1️⃣ Clonar el repositori

``` bash
git clone https://github.com/USERNAME/REPO.git
cd REPO
```

Etc. ...

# 📷 Exemple d'ús

1.  L'usuari selecciona un fitxer multimèdia
2.  El fitxer es puja a **IPFS**
3.  Es genera un **CID**
4.  El CID i les metadades es registren al **smart contract**
5.  El contingut apareix a la llista del frontend

# 📊 Organització del treball

El projecte s'ha gestionat utilitzant:

-   GitHub
-   Issues
-   Metodologia tipus **Scrum**

Cada funcionalitat s'ha desenvolupat mitjançant:

-   branques (`feature/...`)
-   commits descriptius
-   pull requests

# 🎥 Demo del sistema

Incloure:

-   captura de pantalla
-   vídeo de demostració
-   o enllaç a una demo

# 📚 Conclusions

Explicar breument:

-   dificultats trobades
-   decisions tècniques preses
-   possibles millores futures

# 📜 Llicència

Projecte desenvolupat amb finalitats educatives.
