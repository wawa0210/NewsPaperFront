

CKEDITOR.plugins.add( 'find', {
	requires: 'dialog',
	// jscs:disable maximumLineLength
	lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
	// jscs:enable maximumLineLength
	icons: 'find,find-rtl,replace', // %REMOVE_LINE_CORE%
	hidpi: true, // %REMOVE_LINE_CORE%
	init: function( editor ) {
		var findCommand = editor.addCommand( 'find', new CKEDITOR.dialogCommand( 'find' ) );
		findCommand.canUndo = false;
		findCommand.readOnly = 1;

		var replaceCommand = editor.addCommand( 'replace', new CKEDITOR.dialogCommand( 'replace' ) );
		replaceCommand.canUndo = false;

		if ( editor.ui.addButton ) {
			editor.ui.addButton( 'Find', {
				label: editor.lang.find.find,
				command: 'find',
				toolbar: 'find,10'
			} );

			editor.ui.addButton( 'Replace', {
				label: editor.lang.find.replace,
				command: 'replace',
				toolbar: 'find,20'
			} );
		}

		CKEDITOR.dialog.add( 'find', this.path + 'dialogs/find.js' );
		CKEDITOR.dialog.add( 'replace', this.path + 'dialogs/find.js' );
	}
} );


CKEDITOR.config.find_highlight = { element: 'span', styles: { 'background-color': '#004', color: '#fff' } };
