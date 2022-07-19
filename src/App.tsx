import React, { useState, useEffect } from "react";
import styled from "styled-components";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "@walletconnect/qrcode-modal";
import { convertUtf8ToHex } from "@walletconnect/utils";
import { IInternalEvent } from "@walletconnect/types";
import Button from "./components/Button";
import Column from "./components/Column";
import Wrapper from "./components/Wrapper";
import Modal from "./components/Modal";
import Header from "./components/Header";
import Loader from "./components/Loader";
import { fonts } from "./styles";
import { apiGetAccountAssets, apiGetGasPrices, apiGetAccountNonce } from "./helpers/api";
import {
  sanitizeHex,
  verifySignature,
  hashTypedDataMessage,
  hashMessage,
} from "./helpers/utilities";
import { convertAmountToRawNumber, convertStringToHex } from "./helpers/bignumber";
import { IAssetData } from "./helpers/types";
import Banner from "./components/Banner";
import AccountAssets from "./components/AccountAssets";
import { eip712 } from "./helpers/eip712";

const SLayout = styled.div`
  position: relative;
  width: 100%;
  /* height: 100%; */
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper as any)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const SLanding = styled(Column as any)`
  height: 600px;
`;

const SButtonContainer = styled(Column as any)`
  width: 250px;
  margin: 50px 0;
`;

const SConnectButton = styled(Button as any)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  margin: 12px 0;
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SModalContainer = styled.div`
  width: 100%;
  position: relative;
  word-wrap: break-word;
`;

const SModalTitle = styled.div`
  margin: 1em 0;
  font-size: 20px;
  font-weight: 700;
`;

const SModalParagraph = styled.p`
  margin-top: 30px;
`;

// @ts-ignore
const SBalances = styled(SLanding as any)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

const STable = styled(SContainer as any)`
  flex-direction: column;
  text-align: left;
`;

const SRow = styled.div`
  width: 100%;
  display: flex;
  margin: 6px 0;
`;

const SKey = styled.div`
  width: 30%;
  font-weight: 700;
`;

const SValue = styled.div`
  width: 70%;
  font-family: monospace;
`;

const STestButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
`;

const STestButton = styled(Button as any)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  max-width: 175px;
  margin: 12px;
`;

interface IAppState {
  connector: WalletConnect | null;
  fetching: boolean;
  connected: boolean;
  chainId: number;
  showModal: boolean;
  pendingRequest: boolean;
  uri: string;
  accounts: string[];
  address: string;
  result: any | null;
  assets: IAssetData[];
}

const INITIAL_STATE: IAppState = {
  connector: null,
  fetching: false,
  connected: false,
  chainId: 1,
  showModal: false,
  pendingRequest: false,
  uri: "",
  accounts: [],
  address: "",
  result: null,
  assets: [],
};

// bridge url
const bridge = "https://bridge.walletconnect.org";

// create new connector
const connector = new WalletConnect({ bridge, qrcodeModal: QRCodeModal });

const App = () => {
  const [state, setState] = useState<IAppState>({
    connector: null,
    fetching: false,
    connected: false,
    chainId: 1,
    showModal: false,
    pendingRequest: false,
    uri: "",
    accounts: [],
    address: "",
    result: null,
    assets: [],
  });

  // console.log("connector", connector.connected);

  useEffect(() => {
    setState(prev => ({ ...prev, connector }));

    if (connector && connector.connected) {
      const { chainId, accounts } = connector;
      const address = accounts[0];
      setState(prev => {
        return {
          ...prev,
          connected: true,
          chainId,
          accounts,
          address,
        };
      });
    }
  }, [connector.connected]);

  const connect = async () => {
    // check if already connected
    if (!connector.connected) {
      // create new session
      await connector.createSession();
    }

    // subscribe to events
    await subscribeToEvents();
  };

  const subscribeToEvents = () => {
    const { connector } = state;

    if (!connector) {
      return;
    }

    connector.on("session_update", async (error, payload) => {
      console.log(`connector.on("session_update")`);

      if (error) {
        throw error;
      }

      const { chainId, accounts } = payload.params[0];
      onSessionUpdate(accounts, chainId);
    });

    connector.on("connect", (error, payload) => {
      console.log(`connector.on("connect")`);

      if (error) {
        throw error;
      }

      onConnect(payload);
    });

    connector.on("disconnect", (error, payload) => {
      console.log(`connector.on("disconnect")`);

      if (error) {
        throw error;
      }

      onDisconnect();
    });

    if (connector.connected) {
      const { chainId, accounts } = connector;
      const address = accounts[0];
      setState(prev => {
        return {
          ...prev,
          connected: true,
          chainId,
          accounts,
          address,
        };
      });
      onSessionUpdate(accounts, chainId);
    }
    setState(prev => {
      return {
        ...prev,
        connector,
      };
    });
  };

  const killSession = async () => {
    const { connector } = state;
    if (connector) {
      connector.killSession();
    }
    resetApp();
  };

  const resetApp = async () => {
    setState(prev => {
      return {
        ...prev,
        ...INITIAL_STATE,
      };
    });
  };

  const onConnect = async (payload: IInternalEvent) => {
    const { chainId, accounts } = payload.params[0];
    const address = accounts[0];
    setState(prev => {
      return {
        ...prev,
        connected: true,
        chainId,
        accounts,
        address,
      };
    });
    getAccountAssets();
  };

  const onDisconnect = async () => {
    resetApp();
  };

  const onSessionUpdate = async (accounts: string[], chainId: number) => {
    const address = accounts[0];
    setState(prev => {
      return {
        ...prev,
        chainId,
        accounts,
        address,
      };
    });
    await getAccountAssets();
  };

  const getAccountAssets = async () => {
    const { address, chainId } = state;
    setState(prev => {
      return {
        ...prev,
        fetching: true,
      };
    });
    try {
      // get account balances
      const assets = await apiGetAccountAssets(address, chainId);

      setState(prev => {
        return {
          ...prev,
          fetching: false,
          address,
          assets,
        };
      });
    } catch (error) {
      console.error(error);
      setState(prev => {
        return {
          ...prev,
          fetching: false,
        };
      });
    }
  };

  const toggleModal = () => {
    setState(prev => {
      return {
        ...prev,
        showModal: !state.showModal,
      };
    });
  };

  const testSendTransaction = async () => {
    const { connector, address, chainId } = state;

    if (!connector) {
      return;
    }

    // from
    const from = address;

    // to
    const to = address;

    // nonce
    const _nonce = await apiGetAccountNonce(address, chainId);
    const nonce = sanitizeHex(convertStringToHex(_nonce));

    // gasPrice
    const gasPrices = await apiGetGasPrices();
    const _gasPrice = gasPrices.slow.price;
    const gasPrice = sanitizeHex(convertStringToHex(convertAmountToRawNumber(_gasPrice, 9)));

    // gasLimit
    const _gasLimit = 21000;
    const gasLimit = sanitizeHex(convertStringToHex(_gasLimit));

    // value
    const _value = 0;
    const value = sanitizeHex(convertStringToHex(_value));

    // data
    const data = "0x";

    // test transaction
    const tx = {
      from,
      to,
      nonce,
      gasPrice,
      gasLimit,
      value,
      data,
    };

    try {
      // open modal
      toggleModal();

      // toggle pending request indicator
      setState(prev => {
        return {
          ...prev,
          pendingRequest: true,
        };
      });

      // send transaction
      const result = await connector.sendTransaction(tx);

      // format displayed result
      const formattedResult = {
        method: "eth_sendTransaction",
        txHash: result,
        from: address,
        to: address,
        value: `${_value} ETH`,
      };

      // display result
      setState(prev => {
        return {
          ...prev,
          connector,
          pendingRequest: false,
          result: formattedResult || null,
        };
      });
    } catch (error) {
      console.error(error);
      setState(prev => {
        return {
          ...prev,
          connector,
          pendingRequest: false,
          result: null,
        };
      });
    }
  };

  const testSignTransaction = async () => {
    const { connector, address, chainId } = state;

    if (!connector) {
      return;
    }

    // from
    const from = address;

    // to
    const to = address;

    // nonce
    const _nonce = await apiGetAccountNonce(address, chainId);
    const nonce = sanitizeHex(convertStringToHex(_nonce));

    // gasPrice
    const gasPrices = await apiGetGasPrices();
    const _gasPrice = gasPrices.slow.price;
    const gasPrice = sanitizeHex(convertStringToHex(convertAmountToRawNumber(_gasPrice, 9)));

    // gasLimit
    const _gasLimit = 21000;
    const gasLimit = sanitizeHex(convertStringToHex(_gasLimit));

    // value
    const _value = 0;
    const value = sanitizeHex(convertStringToHex(_value));

    // data
    const data = "0x";

    // test transaction
    const tx = {
      from,
      to,
      nonce,
      gasPrice,
      gasLimit,
      value,
      data,
    };

    try {
      // open modal
      toggleModal();

      // toggle pending request indicator
      setState(prev => {
        return { ...prev, pendingRequest: true };
      });

      // send transaction
      const result = await connector.signTransaction(tx);

      // format displayed result
      const formattedResult = {
        method: "eth_signTransaction",
        from: address,
        to: address,
        value: `${_value} ETH`,
        result,
      };

      // display result
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: formattedResult || null };
      });
    } catch (error) {
      console.error(error);
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: null };
      });
    }
  };

  const testLegacySignMessage = async () => {
    const { connector, address, chainId } = state;

    if (!connector) {
      return;
    }

    // test message
    const message = `My email is john@doe.com - ${new Date().toUTCString()}`;

    // hash message
    const hash = hashMessage(message);

    // eth_sign params
    const msgParams = [address, hash];

    try {
      // open modal
      toggleModal();

      // toggle pending request indicator
      setState(prev => {
        return { ...prev, pendingRequest: true };
      });

      // send message
      const result = await connector.signMessage(msgParams);

      // verify signature
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "eth_sign (legacy)",
        address,
        valid,
        result,
      };

      // display result
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: formattedResult || null };
      });
    } catch (error) {
      console.error(error);
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: null };
      });
    }
  };

  const testStandardSignMessage = async () => {
    const { connector, address, chainId } = state;

    if (!connector) {
      return;
    }

    // test message
    const message = `My email is john@doe.com - ${new Date().toUTCString()}`;

    // encode message (hex)
    const hexMsg = convertUtf8ToHex(message);

    // eth_sign params
    const msgParams = [address, hexMsg];

    try {
      // open modal
      toggleModal();

      // toggle pending request indicator
      setState(prev => {
        return { ...prev, pendingRequest: true };
      });

      // send message
      const result = await connector.signMessage(msgParams);

      // verify signature
      const hash = hashMessage(message);
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "eth_sign (standard)",
        address,
        valid,
        result,
      };

      // display result
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: formattedResult || null };
      });
    } catch (error) {
      console.error(error);
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: null };
      });
    }
  };

  const testPersonalSignMessage = async () => {
    const { connector, address, chainId } = state;

    if (!connector) {
      return;
    }

    // test message
    const message = `My email is john@doe.com - ${new Date().toUTCString()}`;

    // encode message (hex)
    const hexMsg = convertUtf8ToHex(message);

    // eth_sign params
    const msgParams = [hexMsg, address];

    try {
      // open modal
      toggleModal();

      // toggle pending request indicator
      setState(prev => {
        return {
          ...prev,
          pendingRequest: true,
        };
      });

      // send message
      const result = await connector.signPersonalMessage(msgParams);

      // verify signature
      const hash = hashMessage(message);
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "personal_sign",
        address,
        valid,
        result,
      };

      // display result
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: formattedResult || null };
      });
    } catch (error) {
      console.error(error);
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: null };
      });
    }
  };

  const testSignTypedData = async () => {
    const { connector, address, chainId } = state;

    if (!connector) {
      return;
    }

    const message = JSON.stringify(eip712.example);

    // eth_signTypedData params
    const msgParams = [address, message];

    try {
      // open modal
      toggleModal();

      // toggle pending request indicator
      setState(prev => {
        return { ...prev, pendingRequest: true };
      });

      // sign typed data
      const result = await connector.signTypedData(msgParams);

      // verify signature
      const hash = hashTypedDataMessage(message);
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "eth_signTypedData",
        address,
        valid,
        result,
      };

      // display result
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: formattedResult || null };
      });
    } catch (error) {
      console.error(error);
      setState(prev => {
        return { ...prev, connector, pendingRequest: false, result: null };
      });
    }
  };

  return (
    <SLayout>
      <Column maxWidth={1000} spanHeight>
        <Header
          connected={state.connected}
          address={state.address}
          chainId={state.chainId}
          killSession={killSession}
        />
        <SContent>
          {!state.address && !state.connected ? (
            <SLanding center>
              <h3>
                {`Try out WalletConnect`}
                <br />
                <span>{`v${process.env.REACT_APP_VERSION}`}</span>
              </h3>
              <SButtonContainer>
                <SConnectButton left onClick={connect} fetching={state.fetching}>
                  {"Connect to WalletConnect"}
                </SConnectButton>
              </SButtonContainer>
            </SLanding>
          ) : (
            <SBalances>
              <Banner />
              <h3>Actions</h3>
              <Column center>
                <STestButtonContainer>
                  <STestButton left onClick={testSendTransaction}>
                    {"eth_sendTransaction"}
                  </STestButton>
                  <STestButton left onClick={testSignTransaction}>
                    {"eth_signTransaction"}
                  </STestButton>
                  <STestButton left onClick={testSignTypedData}>
                    {"eth_signTypedData"}
                  </STestButton>
                  <STestButton left onClick={testLegacySignMessage}>
                    {"eth_sign (legacy)"}
                  </STestButton>
                  <STestButton left onClick={testStandardSignMessage}>
                    {"eth_sign (standard)"}
                  </STestButton>
                  <STestButton left onClick={testPersonalSignMessage}>
                    {"personal_sign"}
                  </STestButton>
                </STestButtonContainer>
              </Column>
              <h3>Balances</h3>
              {!state.fetching ? (
                <AccountAssets chainId={state.chainId} assets={state.assets} />
              ) : (
                <Column center>
                  <SContainer>
                    <Loader />
                  </SContainer>
                </Column>
              )}
            </SBalances>
          )}
        </SContent>
      </Column>
      <Modal show={state.showModal} toggleModal={toggleModal}>
        {state.pendingRequest ? (
          <SModalContainer>
            <SModalTitle>{"Pending Call Request"}</SModalTitle>
            <SContainer>
              <Loader />
              <SModalParagraph>{"Approve or reject request using your wallet"}</SModalParagraph>
            </SContainer>
          </SModalContainer>
        ) : state.result ? (
          <SModalContainer>
            <SModalTitle>{"Call Request Approved"}</SModalTitle>
            <STable>
              {Object.keys(state.result).map(key => (
                <SRow key={key}>
                  <SKey>{key}</SKey>
                  <SValue>{state.result[key].toString()}</SValue>
                </SRow>
              ))}
            </STable>
          </SModalContainer>
        ) : (
          <SModalContainer>
            <SModalTitle>{"Call Request Rejected"}</SModalTitle>
          </SModalContainer>
        )}
      </Modal>
    </SLayout>
  );
};
export default App;
