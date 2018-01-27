

( function() {
	CKEDITOR.plugins.add( 'pastefromword', {
		requires: 'clipboard',
		// jscs:disable maximumLineLength
		lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
		// jscs:enable maximumLineLength
		icons: 'pastefromword,pastefromword-rtl', // %REMOVE_LINE_CORE%
		hidpi: true, // %REMOVE_LINE_CORE%
		init: function( editor ) {
			var commandName = 'pastefromword',
				// Flag indicate this command is actually been asked instead of a generic pasting.
				forceFromWord = 0,
				path = this.path;

			editor.addCommand( commandName, {
				// Snapshots are done manually by editable.insertXXX methods.
				canUndo: false,
				async: true,

				exec: function( editor ) {
					var cmd = this;

					forceFromWord = 1;
					// Force html mode for incomming paste events sequence.
					editor.once( 'beforePaste', forceHtmlMode );

					editor.getClipboardData( { title: editor.lang.pastefromword.title }, function( data ) {
						// Do not use editor#paste, because it would start from beforePaste event.
						data && editor.fire( 'paste', {
							type: 'html',
							dataValue: data.dataValue,
							method: 'paste',
							dataTransfer: CKEDITOR.plugins.clipboard.initPasteDataTransfer()
						} );

						editor.fire( 'afterCommandExec', {
							name: commandName,
							command: cmd,
							returnValue: !!data
						} );
					} );
				}
			} );

			// Register the toolbar button.
			editor.ui.addButton && editor.ui.addButton( 'PasteFromWord', {
				label: editor.lang.pastefromword.toolbar,
				command: commandName,
				toolbar: 'clipboard,50'
			} );

			editor.on( 'pasteState', function( evt ) {
				editor.getCommand( commandName ).setState( evt.data );
			} );

			// Features bring by this command beside the normal process:
			// 1. No more bothering of user about the clean-up.
			// 2. Perform the clean-up even if content is not from MS-Word.
			// (e.g. from a MS-Word similar application.)
			// 3. Listen with high priority (3), so clean up is done before content
			// type sniffing (priority = 6).
			editor.on( 'paste', function( evt ) {
				var data = evt.data,
					mswordHtml = data.dataValue;

				// MS-WORD format sniffing.
				if ( mswordHtml && ( forceFromWord || ( /(class=\"?Mso|style=\"[^\"]*\bmso\-|w:WordDocument)/ ).test( mswordHtml ) ) ) {
					// Do not apply paste filter to data filtered by the Word filter (#13093).
					data.dontFilter = true;

					// If filter rules aren't loaded then cancel 'paste' event,
					// load them and when they'll get loaded fire new paste event
					// for which data will be filtered in second execution of
					// this listener.
					var isLazyLoad = loadFilterRules( editor, path, function() {
						// Event continuation with the original data.
						if ( isLazyLoad )
							editor.fire( 'paste', data );
						else if ( !editor.config.pasteFromWordPromptCleanup || ( forceFromWord || confirm( editor.lang.pastefromword.confirmCleanup ) ) ) // jshint ignore:line
							data.dataValue = CKEDITOR.cleanWord( mswordHtml, editor );

						// Reset forceFromWord.
						forceFromWord = 0;
					} );

					// The cleanup rules are to be loaded, we should just cancel
					// this event.
					isLazyLoad && evt.cancel();
				}
			}, null, null, 3 );
		}

	} );

	function loadFilterRules( editor, path, callback ) {
		var isLoaded = CKEDITOR.cleanWord;

		if ( isLoaded )
			callback();
		else {
			var filterFilePath = CKEDITOR.getUrl( editor.config.pasteFromWordCleanupFile || ( path + 'filter/default.js' ) );

			// Load with busy indicator.
			CKEDITOR.scriptLoader.load( filterFilePath, callback, null, true );
		}

		return !isLoaded;
	}

	function forceHtmlMode( evt ) {
		evt.data.type = 'html';
	}
} )();





