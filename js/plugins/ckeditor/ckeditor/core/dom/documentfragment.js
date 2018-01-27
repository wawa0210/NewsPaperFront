


CKEDITOR.dom.documentFragment = function( nodeOrDoc ) {
	nodeOrDoc = nodeOrDoc || CKEDITOR.document;

	if ( nodeOrDoc.type == CKEDITOR.NODE_DOCUMENT )
		this.$ = nodeOrDoc.$.createDocumentFragment();
	else
		this.$ = nodeOrDoc;
};

CKEDITOR.tools.extend( CKEDITOR.dom.documentFragment.prototype, CKEDITOR.dom.element.prototype, {
	
	type: CKEDITOR.NODE_DOCUMENT_FRAGMENT,

	
	insertAfterNode: function( node ) {
		node = node.$;
		node.parentNode.insertBefore( this.$, node.nextSibling );
	},

	
	getHtml: function() {
		var container = new CKEDITOR.dom.element( 'div' );

		this.clone( 1, 1 ).appendTo( container );

		return container.getHtml().replace( /\s*data-cke-expando=".*?"/g, '' );
	}
}, true, {
	'append': 1, 'appendBogus': 1, 'clone': 1, 'getFirst': 1, 'getHtml': 1, 'getLast': 1, 'getParent': 1, 'getNext': 1, 'getPrevious': 1,
	'appendTo': 1, 'moveChildren': 1, 'insertBefore': 1, 'insertAfterNode': 1, 'replace': 1, 'trim': 1, 'type': 1,
	'ltrim': 1, 'rtrim': 1, 'getDocument': 1, 'getChildCount': 1, 'getChild': 1, 'getChildren': 1
} );
