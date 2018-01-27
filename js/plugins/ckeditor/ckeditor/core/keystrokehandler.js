


CKEDITOR.keystrokeHandler = function( editor ) {
	if ( editor.keystrokeHandler )
		return editor.keystrokeHandler;

	
	this.keystrokes = {};

	
	this.blockedKeystrokes = {};

	this._ = {
		editor: editor
	};

	return this;
};

( function() {
	var cancel;

	var onKeyDown = function( event ) {
			// The DOM event object is passed by the "data" property.
			event = event.data;

			var keyCombination = event.getKeystroke();
			var command = this.keystrokes[ keyCombination ];
			var editor = this._.editor;

			cancel = ( editor.fire( 'key', { keyCode: keyCombination, domEvent: event } ) === false );

			if ( !cancel ) {
				if ( command ) {
					var data = { from: 'keystrokeHandler' };
					cancel = ( editor.execCommand( command, data ) !== false );
				}

				if ( !cancel )
					cancel = !!this.blockedKeystrokes[ keyCombination ];
			}

			if ( cancel )
				event.preventDefault( true );

			return !cancel;
		};

	var onKeyPress = function( event ) {
			if ( cancel ) {
				cancel = false;
				event.data.preventDefault( true );
			}
		};

	CKEDITOR.keystrokeHandler.prototype = {
		
		attach: function( domObject ) {
			// For most browsers, it is enough to listen to the keydown event
			// only.
			domObject.on( 'keydown', onKeyDown, this );

			// Some browsers instead, don't cancel key events in the keydown, but in the
			// keypress. So we must do a longer trip in those cases.
			if ( CKEDITOR.env.gecko && CKEDITOR.env.mac )
				domObject.on( 'keypress', onKeyPress, this );
		}
	};
} )();




