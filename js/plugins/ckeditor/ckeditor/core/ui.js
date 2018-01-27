


CKEDITOR.ui = function( editor ) {
	if ( editor.ui )
		return editor.ui;

	this.items = {};
	this.instances = {};
	this.editor = editor;

	
	this._ = {
		handlers: {}
	};

	return this;
};

// PACKAGER_RENAME( CKEDITOR.ui )

CKEDITOR.ui.prototype = {
	
	add: function( name, type, definition ) {
		// Compensate the unique name of this ui item to definition.
		definition.name = name.toLowerCase();

		var item = this.items[ name ] = {
			type: type,
			// The name of {@link CKEDITOR.command} which associate with this UI.
			command: definition.command || null,
			args: Array.prototype.slice.call( arguments, 2 )
		};

		CKEDITOR.tools.extend( item, definition );
	},

	
	get: function( name ) {
		return this.instances[ name ];
	},

	
	create: function( name ) {
		var item = this.items[ name ],
			handler = item && this._.handlers[ item.type ],
			command = item && item.command && this.editor.getCommand( item.command );

		var result = handler && handler.create.apply( this, item.args );

		this.instances[ name ] = result;

		// Add reference inside command object.
		if ( command )
			command.uiItems.push( result );

		if ( result && !result.type )
			result.type = item.type;

		return result;
	},

	
	addHandler: function( type, handler ) {
		this._.handlers[ type ] = handler;
	},

	
	space: function( name ) {
		return CKEDITOR.document.getById( this.spaceId( name ) );
	},

	
	spaceId: function( name ) {
		return this.editor.id + '_' + name;
	}
};

CKEDITOR.event.implementOn( CKEDITOR.ui );








