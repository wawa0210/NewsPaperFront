



( function() {
	// The pastetext command definition.
	var pasteTextCmd = {
		// Snapshots are done manually by editable.insertXXX methods.
		canUndo: false,
		async: true,

		exec: function( editor ) {
			editor.getClipboardData( { title: editor.lang.pastetext.title }, function( data ) {
				// Do not use editor#paste, because it would start from beforePaste event.
				data && editor.fire( 'paste', {
					type: 'text',
					dataValue: data.dataValue,
					method: 'paste',
					dataTransfer: CKEDITOR.plugins.clipboard.initPasteDataTransfer()
				} );

				editor.fire( 'afterCommandExec', {
					name: 'pastetext',
					command: pasteTextCmd,
					returnValue: !!data
				} );
			} );
		}
	};

	// Register the plugin.
	CKEDITOR.plugins.add( 'pastetext', {
		requires: 'clipboard',
		// jscs:disable maximumLineLength
		lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
		// jscs:enable maximumLineLength
		icons: 'pastetext,pastetext-rtl', // %REMOVE_LINE_CORE%
		hidpi: true, // %REMOVE_LINE_CORE%
		init: function( editor ) {
			var commandName = 'pastetext';

			editor.addCommand( commandName, pasteTextCmd );

			editor.ui.addButton && editor.ui.addButton( 'PasteText', {
				label: editor.lang.pastetext.button,
				command: commandName,
				toolbar: 'clipboard,40'
			} );

			if ( editor.config.forcePasteAsPlainText ) {
				editor.on( 'beforePaste', function( evt ) {
					// Do NOT overwrite if HTML format is explicitly requested.
					// This allows pastefromword dominates over pastetext.
					if ( evt.data.type != 'html' )
						evt.data.type = 'text';
				} );
			}

			editor.on( 'pasteState', function( evt ) {
				editor.getCommand( commandName ).setState( evt.data );
			} );
		}
	} );
} )();



