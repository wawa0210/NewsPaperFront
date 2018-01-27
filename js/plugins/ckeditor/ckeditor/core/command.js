


CKEDITOR.command = function( editor, commandDefinition ) {
	
	this.uiItems = [];

	
	this.exec = function( data ) {
		if ( this.state == CKEDITOR.TRISTATE_DISABLED || !this.checkAllowed() )
			return false;

		if ( this.editorFocus ) // Give editor focus if necessary (#4355).
			editor.focus();

		if ( this.fire( 'exec' ) === false )
			return true;

		return ( commandDefinition.exec.call( this, editor, data ) !== false );
	};

	
	this.refresh = function( editor, path ) {
		// Do nothing is we're on read-only and this command doesn't support it.
		// We don't need to disabled the command explicitely here, because this
		// is already done by the "readOnly" event listener.
		if ( !this.readOnly && editor.readOnly )
			return true;

		// Disable commands that are not allowed in the current selection path context.
		if ( this.context && !path.isContextFor( this.context ) ) {
			this.disable();
			return true;
		}

		// Disable commands that are not allowed by the active filter.
		if ( !this.checkAllowed( true ) ) {
			this.disable();
			return true;
		}

		// Make the "enabled" state a default for commands enabled from start.
		if ( !this.startDisabled )
			this.enable();

		// Disable commands which shouldn't be enabled in this mode.
		if ( this.modes && !this.modes[ editor.mode ] )
			this.disable();

		if ( this.fire( 'refresh', { editor: editor, path: path } ) === false )
			return true;

		return ( commandDefinition.refresh && commandDefinition.refresh.apply( this, arguments ) !== false );
	};

	var allowed;

	
	this.checkAllowed = function( noCache ) {
		if ( !noCache && typeof allowed == 'boolean' )
			return allowed;

		return allowed = editor.activeFilter.checkFeature( this );
	};

	CKEDITOR.tools.extend( this, commandDefinition, {
		
		modes: { wysiwyg: 1 },

		
		editorFocus: 1,

		
		contextSensitive: !!commandDefinition.context,

		
		state: CKEDITOR.TRISTATE_DISABLED
	} );

	// Call the CKEDITOR.event constructor to initialize this instance.
	CKEDITOR.event.call( this );
};

CKEDITOR.command.prototype = {
	
	enable: function() {
		if ( this.state == CKEDITOR.TRISTATE_DISABLED && this.checkAllowed() )
			this.setState( ( !this.preserveState || ( typeof this.previousState == 'undefined' ) ) ? CKEDITOR.TRISTATE_OFF : this.previousState );
	},

	
	disable: function() {
		this.setState( CKEDITOR.TRISTATE_DISABLED );
	},

	
	setState: function( newState ) {
		// Do nothing if there is no state change.
		if ( this.state == newState )
			return false;

		if ( newState != CKEDITOR.TRISTATE_DISABLED && !this.checkAllowed() )
			return false;

		this.previousState = this.state;

		// Set the new state.
		this.state = newState;

		// Fire the "state" event, so other parts of the code can react to the
		// change.
		this.fire( 'state' );

		return true;
	},

	
	toggleState: function() {
		if ( this.state == CKEDITOR.TRISTATE_OFF )
			this.setState( CKEDITOR.TRISTATE_ON );
		else if ( this.state == CKEDITOR.TRISTATE_ON )
			this.setState( CKEDITOR.TRISTATE_OFF );
	}
};

CKEDITOR.event.implementOn( CKEDITOR.command.prototype );





 
