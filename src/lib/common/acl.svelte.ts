import { translate } from '$lib/i18n';
import JWCC from 'json5'
import { isValidCIDR, isValidIP, toastError, toastSuccess } from "$lib/common/funcs"
import { setPolicy } from './api'
import type { ToastStore } from '@skeletonlabs/skeleton'
import { debug } from './debug'

export type TagOwners = string[]
export type TagOwnersTyped = { users: string[], groups: string[] }

export type AclGroups = { [key: string]: string[] }
export type AclTagOwners = { [key: string]: TagOwners }
export type AclHosts = { [key: string]: string }
export type AclPolicies = AclPolicy[]
export type AclSshRules = AclSshRule[]
export type AclPoliciesIndexed = {policy: AclPolicy, idx: number}[]
export type AclSshRulesIndexed = {rule: AclSshRule, idx: number}[]

// metadata for ACL policy entries
export type HAMeta = {
    name: string,
    open: boolean,
}

export function normHAMeta(meta: Partial<HAMeta>): HAMeta {
    let def = HAMetaDefault
    return {
        name: meta.name ?? def.name,
        open: meta.open ?? def.open,
    }
}

export const HAMetaDefault = {
    name: "",
    open: true,
}

export type AclPolicy = {
    [key: string]: unknown,
    "#ha-meta"?: HAMeta,
    action: 'accept',
    proto?: string,
    src: string[],
    dst: string[],
}
export type AclSshRule = {
    [key: string]: unknown,
    action: 'accept' | 'check',
    checkPeriod?: string,
    acceptEnv?: string[],
    src: string[],
    dst: string[],
    users: string[],
}

export type ACL = {
    [key: string]: unknown,
    groups?: AclGroups,
    tagOwners?: AclTagOwners,
    hosts?: AclHosts,
    acls?: AclPolicies,
    ssh?: AclSshRules,
}

export type PrefixType = "group" | "tag"

const Prefixes: Record<PrefixType, string> = {
    "group": "group:",
    "tag": "tag:",
}

const RegexGroupName = /^[a-z0-9-\.]+$/
const RegexTagName = /^[^\s:]+$/
const RegexHostName = /^[a-z0-9-\.]+$/

export class ACLBuilder {
    groups = $state<AclGroups>({})
    tagOwners = $state<AclTagOwners>({})
    hosts = $state<AclHosts>({})
    acls = $state<AclPolicies>([])
    ssh = $state<AclSshRules|undefined>(undefined)
    private extra = $state<Record<string, unknown>>({})
    private presentFields: Set<string>

    constructor(
        groups: AclGroups,
        tagOwners: AclTagOwners,
        hosts: AclHosts,
        acls: AclPolicies,
        ssh?: AclSshRules,
        extra: Record<string, unknown> = {},
        presentFields = ['groups', 'tagOwners', 'hosts', 'acls', 'ssh'],
    ) {
        this.groups = groups
        this.tagOwners = tagOwners
        this.hosts = hosts
        this.acls = acls
        this.ssh = ssh
        this.extra = extra
        this.presentFields = new Set(presentFields)
    }

    JSON(space: number = 0): string {
        const editable = {
            groups: this.groups,
            tagOwners: this.tagOwners,
            hosts: this.hosts,
            acls: this.acls,
            ssh: this.ssh,
        }
        const policy: ACL = { ...this.extra }
        for (const [field, value] of Object.entries(editable)) {
            if (this.presentFields.has(field) || (value && Object.keys(value).length > 0)) {
                policy[field] = value
            }
        }
        return JSON.stringify(policy, null, space)
    }

    static emptyACL(): ACLBuilder {
        return new ACLBuilder({}, {}, {}, [], [])
    }

    static defaultACL(): ACLBuilder {
        return new ACLBuilder({}, {}, {}, [{
            "#ha-meta": HAMetaDefault,
            action: "accept",
            src: ["*"],
            dst: ["*:*"],
        }], [])
    }

    static addPolicyMeta(policy: AclPolicy): boolean {
		if (policy["#ha-meta"] === undefined){
			policy["#ha-meta"] = HAMetaDefault
		}
        return policy["#ha-meta"] !== undefined
    }

    static fromPolicy(acl: ACL | string): ACLBuilder {
        if (typeof acl === "string"){
            return this.fromPolicy(JWCC.parse<ACL>(acl))
        }

        if (!acl || typeof acl !== 'object' || Array.isArray(acl)) {
            throw new Error(translate('ui.policyMustBeAJsonObject'))
        }
        for (const field of ['acls', 'ssh'] as const) {
            if (acl[field] !== undefined && !Array.isArray(acl[field])) throw new Error(translate('ui.valueMustBeAnArray', { values: { v0: String(field) } }))
        }
        for (const field of ['groups', 'hosts', 'tagOwners'] as const) {
            if (acl[field] !== undefined && (!acl[field] || typeof acl[field] !== 'object' || Array.isArray(acl[field]))) {
                throw new Error(translate('ui.valueMustBeAnObject', { values: { v0: String(field) } }))
            }
        }
        const { groups, tagOwners, hosts, acls, ssh, ...extra } = JSON.parse(JSON.stringify(acl)) as ACL

        return new ACLBuilder(
            groups || {},
            tagOwners || {},
            hosts || {},
            acls || [],
            ssh,
            extra,
            Object.keys(acl),
        )
    }

    private assertNoAdvancedReferences(alias: string) {
        const references = (value: unknown): boolean => {
            if (typeof value === 'string') return value === alias || value.startsWith(alias + ':')
            if (Array.isArray(value)) return value.some(references)
            if (value && typeof value === 'object') return Object.entries(value).some(([key, child]) => references(key) || references(child))
            return false
        }
        if (references(this.extra)) throw new Error(translate('ui.advancedPolicyFieldsStillReferenceValue', { values: { v0: String(alias) } }))
    }

    private static getPrefix(name: string): PrefixType | null {
        for (const [prefixType, prefix] of Object.entries(Prefixes)) {
            if (name.startsWith(prefix)) {
                return prefixType as PrefixType
            }
        }
        return null
    }

    // remove the group: prefix if it exists
    private static stripPrefix(name: string): string {
        const nameLower = name.toLowerCase()
        for (const prefix of Object.values(Prefixes)) {
            if (nameLower.startsWith(prefix)) {
                return name.substring(prefix.length)
            }
        }
        return name
    }

    private static addPrefix(name: string, type: PrefixType): string {
        return Prefixes[type] + name
    }

    private static normalizePrefix(name: string, type: PrefixType): { prefixed: string, stripped: string } {
        const stripped = this.stripPrefix(name)
        const prefixed = this.addPrefix(stripped, type)
        return { prefixed, stripped }
    }

    static normalizeTag(tag: string): {prefixed: string, stripped: string} {
        return ACLBuilder.normalizePrefix(tag, "tag")
    }

    static normalizeGroup(group: string): {prefixed: string, stripped: string} {
        return ACLBuilder.normalizePrefix(group, "group")
    }

    // throws an error if the name is invalid, otherwise returns the normalized group name
    static validateGroupName(name: string): string {
        name = this.stripPrefix(name)
        if (name.toLowerCase() !== name) {
            throw new Error(translate('ui.groupNameMustBeLowercase'))
        }
        if (!RegexGroupName.test(name)) {
            throw new Error(translate('ui.groupNameIsLimitedToLowercaseAlphabetDigitsDashesAndPeriods'))
        }
        return name
    }

    // tag names can contain anything but spaces
    static validateTagName(name: string): string {
        name = this.stripPrefix(name)
        if (!RegexTagName.test(name)) {
            throw new Error(translate('ui.tagNameMustContainNoSpaces'))
        }
        return name
    }

    // host names can contain anything but spaces
    static validateHostName(name: string): string {
        name = name.toLowerCase()
        if (!RegexHostName.test(name)) {
            throw new Error(translate('ui.hostNameIsLimitedToLowercaseAlphabetDigitsDashesAndPeriods'))
        }
        return name
    }

    static validateHostValue(value: string): string {
        if(isValidIP(value)) {
            return value
        }
        if(isValidCIDR(value)) {
            return value
        }
        throw new Error(translate('ui.invalidHostIpOrCidr'))
    }

    // deep clone of current ACL
    clone(): ACLBuilder {
        return ACLBuilder.fromPolicy(this.JSON())
    }

    /*
     * Host:
     * --------------------------------
     * createHost(name, cidr)
     * getHostCIDR(name)
     * setHost(name, cidr)
     * renameHost(nameOld, nameNew)
     * getHostNames() string[]
     * getHosts(name) [string, string][]
     * hostExists(name)
     * deleteHost(name)
     */


    createHost(name: string, cidr: string) {
        if(this.getHostCIDR(name) !== undefined) {
            throw new Error(translate('ui.hostValueAlreadyExists', { values: { v0: String(name) } }))
        }
        this.setHost(name, cidr)
    }

    getHostCIDR(name: string): string | undefined {
        return this.hosts[name]
    }

    setHost(name: string, value: string) {
        name = ACLBuilder.validateHostName(name)
        value = ACLBuilder.validateHostValue(value)
        this.hosts[name] = value
    }

    renameHost(nameOld: string, nameNew: string) {
        this.assertNoAdvancedReferences(nameOld)
        nameOld = ACLBuilder.validateHostName(nameOld)
        nameNew = ACLBuilder.validateHostName(nameNew)
        if (this.hosts[nameOld] === undefined) {
            throw new Error(translate('ui.hostValueDoesNotExist', { values: { v0: String(nameOld) } }))
        }
        if (this.hosts[nameNew] !== undefined) {
            throw new Error(translate('ui.hostValueAlreadyExists50bb1b', { values: { v0: String(nameNew) } }))
        }

        const hosts: AclHosts = {}
        Object.entries(this.hosts).forEach(([name, value])=>{
            hosts[name === nameOld ? nameNew : name] = value
        })
        this.hosts = hosts

        this.acls.forEach(acl => {
            acl.src = acl.src.map(src => (src === nameOld ? nameNew : src))
            acl.dst = acl.dst.map(dst => (ACLBuilder.getPolicyDstHost(dst) === nameOld ? nameNew + ":" + ACLBuilder.getPolicyDstPorts(dst) : dst))
        })
        this.ssh?.forEach(rule => {
            rule.src = rule.src.map(src => src === nameOld ? nameNew : src)
            rule.dst = rule.dst.map(dst => dst === nameOld ? nameNew : dst)
        })
    }

    getHostNames(): string[] {
        return Object.keys(this.hosts)
    }

    getHosts(): [string, string][] {
        return Object.entries(this.hosts)
    }

    deleteHost(name: string) {
        this.assertNoAdvancedReferences(name)
        if (this.hosts[name] === undefined) {
            throw new Error(translate('ui.hostValueDoesnTExist', { values: { v0: String(name) } }))
        }

        delete this.hosts[name]

        // delete host from ACLs
        for (const acl of this.acls) {
            acl.src = acl.src.filter(s => s !== name)
            acl.dst = acl.dst.filter(d => ACLBuilder.getPolicyDstHost(d) !== name)
        }

        // remove group from SSH
        if (this.ssh !== undefined){
            for (const ssh of this.ssh) {
                ssh.src = ssh.src.filter(s => s !== name)
                ssh.dst = ssh.dst.filter(d => d !== name)
            }
        }
    }


    /*
     * Tags:
     * --------------------------------
     * createTag(name)
     * renameTag(nameOld, nameNew)
     * setTagOwners(name, members[])
     * getTagNames() string[]
     * getTagOwners(name) [string, string[]]
     * getTagOwnersTyped(name) {users: string[], groups: string[]}
     * tagExists(name)
     * deleteTag(name)
     */

    createTag(name: string) {
        name = ACLBuilder.validateTagName(name)
        const { prefixed } = ACLBuilder.normalizePrefix(name, 'tag')
        this.tagOwners[prefixed] = []
    }

    renameTag(nameOld: string, nameNew: string) {
        this.assertNoAdvancedReferences(ACLBuilder.normalizeTag(nameOld).prefixed)
        nameNew = ACLBuilder.validateTagName(nameNew)
        const { prefixed: prefixedNew } = ACLBuilder.normalizePrefix(nameNew, 'tag')
        const { stripped: strippedOld, prefixed: prefixedOld } = ACLBuilder.normalizePrefix(nameOld, 'tag')

        // if names are equal, don't do anything
        if (prefixedNew === prefixedOld) {
            return
        }

        if (this.tagOwners[prefixedOld] === undefined) {
            throw new Error(translate('ui.tagValueDoesnTExist', { values: { v0: String(strippedOld) } }))
        }

        const tagOwners: AclTagOwners = {}
        Object.entries(this.tagOwners).forEach(([name, owners]) => {
            tagOwners[name === prefixedOld ? prefixedNew : name] = owners
        })
        this.tagOwners = tagOwners

        this.acls.forEach(acl => {
            acl.src = acl.src.map(src => (src === prefixedOld ? prefixedNew : src))
            acl.dst = acl.dst.map(dst => (ACLBuilder.getPolicyDstHost(dst) === prefixedOld ? prefixedNew + ":" + ACLBuilder.getPolicyDstPorts(dst) : dst))
        })
        if (this.ssh !== undefined) {
            for (const rule of this.ssh) {
                rule.src = rule.src.map(src => (src === prefixedOld ? prefixedNew : src))
                rule.dst = rule.dst.map(dst => (dst === prefixedOld ? prefixedNew : dst))
            }
        }
    }

    setTagOwners(name: string, owners: TagOwners) {
        const { prefixed } = ACLBuilder.normalizePrefix(name, 'tag')
        const ownersAll = [...owners]
        this.tagOwners[prefixed] = ownersAll
    }

    getTagNames(withPrefix: boolean = false): string[] {
        return Object.keys(this.tagOwners).map(name => {
            let {stripped, prefixed} = ACLBuilder.normalizePrefix(name, 'tag')
            return withPrefix ? prefixed : stripped
        })
    }

    getTagOwners(name: string): string[]{
        const { stripped, prefixed } = ACLBuilder.normalizePrefix(name, 'tag')
        const owners = this.tagOwners[prefixed] 
        if (owners === undefined) {
            throw new Error(translate('ui.tagValueDoesNotExist', { values: { v0: String(stripped) } }))
        }
        return owners
    }

    static TagOwnersByType(owners: TagOwners): TagOwnersTyped {
        const ownersTyped: TagOwnersTyped = {
            users: [],
            groups: [],
        }

        for (const owner of owners) {
            const prefix = ACLBuilder.getPrefix(owner)
            if (prefix === 'group') {
                ownersTyped.groups.push(owner)
            } else {
                ownersTyped.users.push(owner)
            }
        }

        return ownersTyped
    }

    getTagOwnersTyped(name: string): TagOwnersTyped {
        const { stripped, prefixed } = ACLBuilder.normalizePrefix(name, 'tag')
        const owners = this.tagOwners[prefixed]
        if (owners === undefined) {
            throw new Error(translate('ui.tagValueDoesNotExist', { values: { v0: String(stripped) } }))
        }
        return ACLBuilder.TagOwnersByType(owners)
    }

    tagExists(name: string): boolean {
        const { prefixed } = ACLBuilder.normalizePrefix(name, 'tag')
        return this.tagOwners[prefixed] !== undefined
    }

    deleteTag(name: string) {
        this.assertNoAdvancedReferences(ACLBuilder.normalizeTag(name).prefixed)
        const { stripped, prefixed } = ACLBuilder.normalizePrefix(name, 'tag')

        if (this.tagOwners[prefixed] === undefined) {
            throw new Error(translate('ui.tagValueDoesnTExistWithinTheAcl', { values: { v0: String(stripped) } }))
        }

        // remove tag from ACLs
        for (const acl of this.acls){
            acl.src = acl.src.filter(s => s !== prefixed);
            acl.dst = acl.dst.filter(d => ACLBuilder.getPolicyDstHost(d) !== prefixed);
        }

        // remove tag from SSH
        if (this.ssh !== undefined){
            for (const ssh of this.ssh) {
                ssh.src = ssh.src.filter(s => s !== prefixed)
                ssh.dst = ssh.dst.filter(d => d !== prefixed)
            }
        }

        delete this.tagOwners[prefixed]
    }


    /*
     * GROUPS:
     * --------------------------------
     * createGroup(name)
     * renameGroup(nameOld, nameNew)
     * setGroupMembers(name, members[])
     * getGroupNames() string[]
     * getGroupMembers(name)
     * groupExists(name)
     * deleteGroup(name)
     */
    createGroup(name: string) {
        name = ACLBuilder.validateGroupName(name)
        const { stripped, prefixed } = ACLBuilder.normalizePrefix(name, 'group')

        if (this.groups[prefixed] !== undefined) {
            throw new Error(translate('ui.groupValueAlreadyExists', { values: { v0: String(stripped) } }))
        }

        this.groups[prefixed] = []
    }

    renameGroup(nameOld: string, nameNew: string) {
        this.assertNoAdvancedReferences(ACLBuilder.normalizeGroup(nameOld).prefixed)
        nameNew = ACLBuilder.validateGroupName(nameNew)
        const { prefixed: prefixedNew } = ACLBuilder.normalizePrefix(nameNew, 'group')
        const { stripped: strippedOld, prefixed: prefixedOld } = ACLBuilder.normalizePrefix(nameOld, 'group')

        // if names are equal, don't do anything
        if (prefixedNew === prefixedOld) {
            return
        }

        if (this.groups[prefixedOld] === undefined) {
            throw new Error(translate('ui.groupValueDoesnTExist', { values: { v0: String(strippedOld) } }))
        }

        const groups: AclGroups = {}
        Object.entries(this.groups).forEach(([name, members]) => {
            groups[name === prefixedOld ? prefixedNew : name] = members
        })
        this.groups = groups

        this.acls.forEach(acl => {
            acl.src = acl.src.map(src => (src === prefixedOld ? prefixedNew : src))
            acl.dst = acl.dst.map(dst => (ACLBuilder.getPolicyDstHost(dst) === prefixedOld ? prefixedNew + ":" + ACLBuilder.getPolicyDstPorts(dst) : dst))
        })

        for (const key in this.tagOwners) {
            this.tagOwners[key] = this.tagOwners[key].map(owner =>
                owner === prefixedOld ? prefixedNew : owner
            )
        }
        if (this.ssh !== undefined) {
            for (const rule of this.ssh) {
                rule.src = rule.src.map(src => (src === prefixedOld ? prefixedNew : src))
                rule.dst = rule.dst.map(src => (src === prefixedOld ? prefixedNew : src))
            }
        }
    }

    setGroupMembers(name: string, members: string[]) {
        const { prefixed } = ACLBuilder.normalizePrefix(name, 'group')

        this.groups[prefixed] = [...members]
    }

    getGroupByName(name: string): string[] {
        const { stripped, prefixed } = ACLBuilder.normalizePrefix(name, 'group')
        return this.groups[name]
    }

    getGroupNames(withPrefix: boolean = false): string[] {
        const names = []
        for (const name of Object.keys(this.groups)) {
            const { stripped, prefixed } = ACLBuilder.normalizePrefix(name, 'group')
            names.push(withPrefix ? prefixed : stripped)
        }
        return names
    }

    getGroupMembers(name: string): string[] | undefined {
        const { prefixed } = ACLBuilder.normalizePrefix(name, 'group')
        return this.groups[prefixed]
    }

    groupExists(name: string): boolean {
        const { prefixed } = ACLBuilder.normalizePrefix(name, 'group')
        return this.groups[prefixed] !== undefined
    }

    deleteGroup(name: string) {
        this.assertNoAdvancedReferences(ACLBuilder.normalizeGroup(name).prefixed)
        const { stripped, prefixed } = ACLBuilder.normalizePrefix(name, 'group')

        // verify group's existence
        if (this.groups[prefixed] === undefined) {
            throw new Error(translate('ui.groupValueDoesnTExist', { values: { v0: String(stripped) } }))
        }

        // remove group from tag owners
        for (const tag of Object.keys(this.tagOwners)) {
            this.tagOwners[tag] = this.tagOwners[tag].filter(t => t !== prefixed)
        }

        // remove group from ACLs
        for (const acl of this.acls) {
            acl.src = acl.src.filter(s => s !== prefixed)
            acl.dst = acl.dst.filter(d => ACLBuilder.getPolicyDstHost(d) !== prefixed)
        }

        // remove group from SSH policies
        if (this.ssh !== undefined){
            for (const ssh of this.ssh) {
                ssh.src = ssh.src.filter(s => s !== prefixed)
                ssh.dst = ssh.dst.filter(d => d !== prefixed)
            }
        }

        delete this.groups[prefixed]
    }
    /*
     * POLICIES:
     * --------------------------------
     * createPolicy(policy)
     * getAllPolicies()
     * getPolicy(idx)
     * setPolicy(idx, policy)
     * delPolicy(idx)
     * setPolicySrc(idx, src)
     * setPolicyDst(idx, dst)
     * setPolicyProto(idx, proto)
     */

	public static getPolicyDstHost(dst: string): string {
		const i = dst.lastIndexOf(':')
		return i < 0 ? dst : dst.substring(0, i)
	}

	public static getPolicyDstPorts(dst: string): string {
		const i = dst.lastIndexOf(':')
		return i < 0 ? dst : dst.substring(i+1, dst.length)
	}


    createPolicy(policy: AclPolicy) {
        if (policy["#ha-meta"] === undefined) {
            policy["#ha-meta"] = HAMetaDefault
        }

        this.acls.push(policy)
    }

    getAllPolicies(): AclPolicies {
        return this.acls
    }

    getPolicy(idx: number): AclPolicy {
        this.validatePolicyIndex(idx)
        return this.acls[idx]
    }

    private validatePolicyIndex(idx: number) {
        if (idx >= this.acls.length || idx < 0) {
            throw new Error(translate('ui.policyDoesNotExistAtIndexValue', { values: { v0: String(idx) } }))
        }
    }

    public static EmptyPolicy(): AclPolicy {
        return {
            "#ha-meta": HAMetaDefault,
            action: "accept",
            proto: undefined,
            src: [],
            dst: [],
        }
    }

    public static DefaultPolicy(): AclPolicy {
        return {
            "#ha-meta": HAMetaDefault,
            action: "accept",
            proto: undefined,
            src: [ "*" ],
            dst: [ "*:*" ],
        }
    }

    setPolicySrc(idx: number, src: string[]) {
        this.validatePolicyIndex(idx)
        this.acls[idx].src = src
    }

    setPolicyDst(idx: number, dst: string[]) {
        this.validatePolicyIndex(idx)
        this.acls[idx].dst = dst
    }

    setPolicyProto(idx: number, proto: string | undefined) {
        this.validatePolicyIndex(idx)
        this.acls[idx].proto = proto
    }

    setPolicy(idx: number, policy: AclPolicy) {
        this.validatePolicyIndex(idx)
        this.acls[idx] = {
            ...this.acls[idx],
            ...policy,
            action: policy.action,
            proto: policy.proto,
            src: policy.src,
            dst: policy.dst,
        }
    }

    delPolicy(idx: number) {
        this.validatePolicyIndex(idx)
        this.acls.splice(idx, 1)
    }

    /*
     * SSH Rules:
     * --------------------------------
     * createSshRule(rule)
     * getAllPolicies()
     * getPolicy(idx)
     * setPolicy(idx, policy)
     * delPolicy(idx)
     * setPolicySrc(idx, src)
     * setPolicyDst(idx, dst)
     * setPolicyProto(idx, proto)
     */

    createSshRule(rule: AclSshRule) {
        if (this.ssh === undefined){
            this.ssh = []
        }
        this.ssh.push(rule)
    }

    getAllSshRules(): AclSshRules|undefined {
        return this.ssh
    }

    getSshRule(idx: number): AclSshRule {
        this.validateSshRuleIndex(idx)
        if (this.ssh !== undefined){
            return this.ssh[idx]
        }
        throw new Error(translate('ui.noSshRulesDefined'))
    }

    private validateSshRuleIndex(idx: number) {
        if (this.ssh === undefined || idx >= this.ssh.length || idx < 0) {
            throw new Error(translate('ui.sshRuleDoesNotExistAtIndexValue', { values: { v0: String(idx) } }))
        }
    }

    public static DefaultSshRule(): AclSshRule {
        return {
            action: "accept",
            src: [],
            dst: [],
            users: [],
        }
    }

    public static getPolicyTitle(pol: AclPolicy, idx: number): string {
		const pfx = "#" + (idx + 1) + ": "
		if (pol["#ha-meta"] === undefined || pol["#ha-meta"].name === "") {
			return pfx + translate('ui.policy') + (idx + 1)
		}
		return pfx + pol["#ha-meta"].name
	}

    setSshRuleSrc(idx: number, src: string[]) {
        this.validateSshRuleIndex(idx)
        if (this.ssh != undefined) {
            this.ssh[idx].src = src
        }
    }

    setSshRuleDst(idx: number, dst: string[]) {
        this.validateSshRuleIndex(idx)
        if (this.ssh !== undefined) {
            this.ssh[idx].dst = dst
        }
    }

    setSshRuleUsers(idx: number, users: string[]) {
        this.validateSshRuleIndex(idx)
        if (this.ssh !== undefined) {
            this.ssh[idx].users = users
        }
    }

    setSshRule(idx: number, rule: AclSshRule) {
        this.validateSshRuleIndex(idx)
        if (this.ssh !== undefined) {
            this.ssh[idx] = {
                ...this.ssh[idx],
                ...rule,
                action: rule.action,
                src: rule.src,
                dst: rule.dst,
                users: rule.users,
            }
        }
    }

    delSshRule(idx: number) {
        this.validateSshRuleIndex(idx)
        if (this.ssh !== undefined) {
            this.ssh.splice(idx, 1)
        }
    }
}

export async function saveConfig(acl: ACLBuilder, ToastStore: ToastStore, loading?: {setLoadingTrue: ()=>void, setLoadingFalse: ()=>void}) {
    if(loading !== undefined){
        loading.setLoadingTrue()
    }
    //loading = true
    try {
        await setPolicy(acl)
        if(ToastStore !== undefined){
            toastSuccess(translate('ui.savedAclConfiguration'), ToastStore)
        }
    } catch(err) {
        if (err instanceof Error){
            if(ToastStore !== undefined){
                toastError('', ToastStore, err)
            }
        }
        debug(err)
    } finally {
        if(loading !== undefined){
            loading.setLoadingFalse()
        }
    }
}
