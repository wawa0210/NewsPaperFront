

 'use strict';

( function() {
	
	CKEDITOR.htmlParser.text = function( value ) {
		
		this.value = value;

		
		this._ = {
			isBlockLike: false
		};
	};

	CKEDITOR.htmlParser.text.prototype = CKEDITOR.tools.extend( new CKEDITOR.htmlParser.node(), {
		
		type: CKEDITOR.NODE_TEXT,

		
		filter: function( filter, context ) {
			if ( !( this.value = filter.onText( context, this.value, this ) ) ) {
				this.remove();
				return false;
			}
		},

		
		writeHtml: function( writer, filter ) {
			if ( filter )
				this.filter( filter );

			writer.text( this.value );
		}
	} );
} )();
