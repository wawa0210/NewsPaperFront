





// Remove the CKEDITOR.loadFullCore reference defined on ckeditor_basic.
delete CKEDITOR.loadFullCore;


CKEDITOR.instances = {};


CKEDITOR.document = new CKEDITOR.dom.document( document );


CKEDITOR.add = function( editor ) {
	CKEDITOR.instances[ editor.name ] = editor;

	editor.on( 'focus', function() {
		if ( CKEDITOR.currentInstance != editor ) {
			CKEDITOR.currentInstance = editor;
			CKEDITOR.fire( 'currentInstance' );
		}
	} );

	editor.on( 'blur', function() {
		if ( CKEDITOR.currentInstance == editor ) {
			CKEDITOR.currentInstance = null;
			CKEDITOR.fire( 'currentInstance' );
		}
	} );

	CKEDITOR.fire( 'instance', null, editor );
};


CKEDITOR.remove = function( editor ) {
	delete CKEDITOR.instances[ editor.name ];
};

( function() {
	var tpls = {};

	
	CKEDITOR.addTemplate = function( name, source ) {
		var tpl = tpls[ name ];
		if ( tpl )
			return tpl;

		// Make it possible to customize the template through event.
		var params = { name: name, source: source };
		CKEDITOR.fire( 'template', params );

		return ( tpls[ name ] = new CKEDITOR.template( params.source ) );
	};

	
	CKEDITOR.getTemplate = function( name ) {
		return tpls[ name ];
	};
} )();

( function() {
	var styles = [];

	
	CKEDITOR.addCss = function( css ) {
		styles.push( css );
	};

	
	CKEDITOR.getCss = function() {
		return styles.join( '\n' );
	};
} )();

// Perform global clean up to free as much memory as possible
// when there are no instances left
CKEDITOR.on( 'instanceDestroyed', function() {
	if ( CKEDITOR.tools.isEmpty( this.instances ) )
		CKEDITOR.fire( 'reset' );
} );

// Load the bootstrap script.
CKEDITOR.loader.load( '_bootstrap' ); // %REMOVE_LINE%

// Tri-state constants.

CKEDITOR.TRISTATE_ON = 1;


CKEDITOR.TRISTATE_OFF = 2;


CKEDITOR.TRISTATE_DISABLED = 0;






