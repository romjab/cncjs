import color from 'cli-color';
import _get from 'lodash/get';
import pubsub from 'pubsub-js';
import React, { useEffect, useRef } from 'react';
import { connect } from 'react-redux';
import uuid from 'uuid/v4';
import settings from 'app/config/settings';
import {
    CONNECTION_STATE_CONNECTED,
    CONNECTION_TYPE_SERIAL,
    CONNECTION_TYPE_SOCKET,
} from 'app/constants/connection';
import useEffectOnce from 'app/hooks/useEffectOnce';
import usePrevious from 'app/hooks/usePrevious';
import controller from 'app/lib/controller';
import i18n from 'app/lib/i18n';
import useWidgetEvent from 'app/widgets/shared/useWidgetEvent';
import Terminal from './Terminal';
import styles from './index.styl';

const Console = ({
    isFullscreen,
    isConnected,
}) => {
    const emitter = useWidgetEvent();
    const prevIsFullscreen = usePrevious(isFullscreen);
    const terminalRef = useRef();
    const sender = useRef(uuid());

    useEffectOnce(() => {
        const onConnectionOpen = (state) => {
            const { type, options } = state;
            const { current: term } = terminalRef;
            if (!term) {
                return;
            }

            const { productName, version } = settings;
            term.writeln(color.white.bold(`${productName} ${version} [${controller.type}]`));

            if (type === CONNECTION_TYPE_SERIAL) {
                const { path, baudRate } = options;
                const line = i18n._('Connected to {{-path}} with a baud rate of {{baudRate}}', {
                    path: color.yellowBright(path),
                    baudRate: color.blueBright(baudRate),
                });
                term.writeln(color.white(line));
            } else if (type === CONNECTION_TYPE_SOCKET) {
                const { host, port } = options;
                const line = i18n._('Connected to {{host}}:{{port}}', {
                    host: color.blueBright(host),
                    port: color.blueBright(port),
                });
                term.writeln(color.white(line));
            }
        };

        const onConnectionClose = (state) => {
            const { current: term } = terminalRef;
            if (!term) {
                return;
            }

            term.current.clear();
        };

        const onConnectionWrite = (state, data, context) => {
            const { source, __sender__ } = { ...context };
            const { current: term } = terminalRef;

            if (__sender__ === sender.current) {
                // Do not write to the terminal console if the sender is the widget itself
                return;
            }

            if (!term) {
                return;
            }

            data = String(data).trim();

            if (source) {
                term.writeln(color.blackBright(source) + color.white(term.prompt + data));
            } else {
                term.writeln(color.white(term.prompt + data));
            }
        };

        const onConnectionRead = (state, data) => {
            const { current: term } = terminalRef;
            if (!term) {
                return;
            }

            term.writeln(data);
        };

        controller.addListener('connection:open', onConnectionOpen);
        controller.addListener('connection:close', onConnectionClose);
        controller.addListener('connection:write', onConnectionWrite);
        controller.addListener('connection:read', onConnectionRead);

        return () => {
            controller.removeListener('connection:open', onConnectionOpen);
            controller.removeListener('connection:close', onConnectionClose);
            controller.removeListener('connection:write', onConnectionWrite);
            controller.removeListener('connection:read', onConnectionRead);
        };
    });

    useEffectOnce(() => {
        const onResizeToken = pubsub.subscribe('resize', (msg) => {
            const { current: term } = terminalRef;
            if (!term) {
                return;
            }

            term.resize();
        });

        return () => {
            pubsub.unsubscribe(onResizeToken);
        };
    });

    useEffect(() => {
        const onSelectAll = () => {
            const { current: term } = terminalRef;
            if (!term) {
                return;
            }

            term.selectAll();
        };
        const onClearSelection = () => {
            const { current: term } = terminalRef;
            if (!term) {
                return;
            }

            term.clearSelection();
        };

        emitter.on('terminal:selectAll', onSelectAll);
        emitter.on('terminal:clearSelection', onClearSelection);

        return () => {
            emitter.off('terminal:selectAll', onSelectAll);
            emitter.off('terminal:clearSelection', onClearSelection);
        };
    }, [emitter]);

    // Run the effect after every render
    useEffect(() => {
        const { current: term } = terminalRef;
        if (!term) {
            return;
        }

        if (prevIsFullscreen !== isFullscreen) {
            term.resize();
        }
    });

    if (!isConnected) {
        return (
            <div className={styles.noSerialConnection}>
                {i18n._('No serial connection')}
            </div>
        );
    }

    return (
        <Terminal
            ref={terminalRef}
            // The buffer starts with 254 bytes free. The terminating <LF> or <CR> counts as a byte.
            cols={254}
            rows={isFullscreen ? 'auto' : 15}
            cursorBlink={true}
            scrollback={1000}
            tabStopWidth={4}
            onData={(data) => {
                const context = {
                    __sender__: sender.current,
                };

                controller.write(data, context);
            }}
        />
    );
};

export default connect(store => {
    const connectionState = _get(store, 'connection.state');
    const isConnected = (connectionState === CONNECTION_STATE_CONNECTED);

    return {
        isConnected,
    };
})(Console);
